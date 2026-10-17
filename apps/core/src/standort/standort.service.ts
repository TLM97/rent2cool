import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import type { Principal, StandortAendern, StandortErstellen } from '@rent2cool/shared';
import {
  ermittleAenderungen,
  neueWerte,
  pruefeVersion,
  versionVon,
  type StammdatenErgebnis,
} from '../audit/aenderung';
import { protokolliereAnlage, schreibeAudit } from '../audit/audit.service';
import type { Database, Transaktion } from '../db/client';
import { DB } from '../db/db.module';
import { istPgFehler, PG_FEHLER } from '../db/fehler';
import { fahrzeug, miete, standort } from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';

export type StandortMitAnzahl = typeof standort.$inferSelect & { fahrzeugAnzahl: number };

/**
 * Taugt der Standort für eine Zuordnung (Heimatstandort, Abholung, Rückgabe)?
 * Gehört zum Mandanten und ist aktiv. Liefert einen Grund oder `undefined`.
 */
export async function standortNutzbar(
  ausfuehrer: Database | Transaktion,
  mandant: string,
  id: string,
  rolle: string,
): Promise<string | undefined> {
  const [s] = await ausfuehrer
    .select({ aktiv: standort.aktiv, name: standort.name })
    .from(standort)
    .where(and(eq(standort.id, id), eq(standort.mandantId, mandant)));
  if (!s) return `${rolle}: Standort nicht gefunden`;
  if (!s.aktiv) return `${rolle}: Standort „${s.name}“ ist deaktiviert`;
  return undefined;
}

const NAME_VERGEBEN = (name: string) => `Es gibt bereits einen Standort „${name}“.`;

/**
 * Standorte (D-011): wenige Datensätze je Mandant, daher ohne Blättern-Zwang;
 * Schreiben nur mit Audit (vollständig beim Anlegen, alt/neu beim Ändern) und
 * Versionsschutz (D-016). Gelöscht wird nicht – nur deaktiviert.
 */
@Injectable()
export class StandortService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async liste(
    mandantId: string | undefined,
    opts: { aktiv?: boolean; limit: number; offset: number },
  ): Promise<{ eintraege: StandortMitAnzahl[]; gesamt: number }> {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
    const filter = and(
      eq(standort.mandantId, mandant),
      opts.aktiv === undefined ? undefined : eq(standort.aktiv, opts.aktiv),
    );
    const [zeilen, [zaehler]] = await Promise.all([
      this.db
        .select({
          s: standort,
          fahrzeugAnzahl: sql<number>`(select count(*)::int from ${fahrzeug} where ${fahrzeug.standortId} = ${standort.id})`,
        })
        .from(standort)
        .where(filter)
        .orderBy(asc(standort.name))
        .limit(opts.limit)
        .offset(opts.offset),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(standort)
        .where(filter),
    ]);
    return {
      eintraege: zeilen.map((z) => ({ ...z.s, fahrzeugAnzahl: z.fahrzeugAnzahl })),
      gesamt: zaehler?.n ?? 0,
    };
  }

  async hole(mandantId: string | undefined, id: string): Promise<typeof standort.$inferSelect> {
    const [row] = await this.db
      .select()
      .from(standort)
      .where(and(eq(standort.id, id), eq(standort.mandantId, mandantId ?? PLACEHOLDER_MANDANT_ID)));
    if (!row) {
      throw new NotFoundException('Standort nicht gefunden');
    }
    return row;
  }

  async erstelle(principal: Principal, p: StandortErstellen): Promise<{ id: string }> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(standort)
          .values({
            mandantId: principal.mandantId ?? PLACEHOLDER_MANDANT_ID,
            name: p.name,
            strasse: p.strasse ?? null,
            plz: p.plz ?? null,
            ort: p.ort ?? null,
            land: p.land,
            region: p.region ?? null,
            geofenceLat: p.geofenceLat ?? null,
            geofenceLng: p.geofenceLng ?? null,
            geofenceRadiusM: p.geofenceRadiusM ?? null,
            oeffnungsregeln: p.oeffnungsregeln ?? null,
          })
          .returning();
        await protokolliereAnlage(tx, principal, 'standort', row!.id, row);
        return { id: row!.id };
      });
    } catch (e: unknown) {
      if (istPgFehler(e, PG_FEHLER.EINDEUTIG, 'uq_standort_mandant_name')) {
        throw new ConflictException(NAME_VERGEBEN(p.name));
      }
      throw e;
    }
  }

  /** Ändern und (de)aktivieren; Deaktivieren nur, wenn nichts mehr daran hängt. */
  async aendere(principal: Principal, id: string, p: StandortAendern): Promise<StammdatenErgebnis> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    const { version, ...eingabe } = p;
    try {
      return await this.db.transaction(async (tx) => {
        const [vorher] = await tx
          .select()
          .from(standort)
          .where(and(eq(standort.id, id), eq(standort.mandantId, mandant)))
          .for('update');
        if (!vorher) {
          throw new NotFoundException('Standort nicht gefunden');
        }
        pruefeVersion(vorher.aktualisiertAm, version);
        if (eingabe.aktiv === false && vorher.aktiv) {
          const gruende = await this.inBenutzung(tx, id);
          if (gruende.length > 0) {
            throw new ConflictException({
              fehler: 'Standort kann nicht deaktiviert werden',
              gruende,
            });
          }
        }
        const a = ermittleAenderungen(vorher, eingabe);
        if (a.felder.length === 0) {
          return { id, version: versionVon(vorher.aktualisiertAm), geaendert: [] };
        }
        const jetzt = new Date();
        await tx
          .update(standort)
          .set({ ...neueWerte(eingabe, a), aktualisiertAm: jetzt })
          .where(eq(standort.id, id));
        await schreibeAudit(tx, principal, {
          aktion: 'PATCH',
          entitaetTyp: 'standort',
          entitaetId: id,
          altWert: a.alt,
          neuWert: a.neu,
        });
        return { id, version: versionVon(jetzt), geaendert: a.felder };
      });
    } catch (e: unknown) {
      if (istPgFehler(e, PG_FEHLER.EINDEUTIG, 'uq_standort_mandant_name')) {
        throw new ConflictException(NAME_VERGEBEN(p.name ?? ''));
      }
      throw e;
    }
  }

  /** Gründe, warum der Standort noch gebraucht wird (Fahrzeuge, laufende/künftige Mieten). */
  private async inBenutzung(tx: Transaktion, id: string): Promise<string[]> {
    const [[f], [m]] = await Promise.all([
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(fahrzeug)
        .where(and(eq(fahrzeug.standortId, id), ne(fahrzeug.status, 'stillgelegt'))),
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(miete)
        .where(
          and(
            or(eq(miete.standortAbholId, id), eq(miete.standortRueckgabeId, id)),
            inArray(miete.status, ['angefragt', 'bestaetigt', 'aktiv']),
          ),
        ),
    ]);
    const gruende: string[] = [];
    if ((f?.n ?? 0) > 0) gruende.push(`${f!.n} Fahrzeug(e) haben hier ihren Heimatstandort`);
    if ((m?.n ?? 0) > 0)
      gruende.push(`${m!.n} laufende oder künftige Miete(n) nutzen diesen Standort`);
    return gruende;
  }
}
