import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  bewerteFahrerEinsatz,
  istFahrerStatus,
  istFahrerUebergangErlaubt,
  istKundeStatus,
  istKundeUebergangErlaubt,
  type EinsatzErgebnis,
  type FahrerStatus,
  type KundeStatus,
  type Principal,
} from '@rent2cool/shared';
import { ermittleAenderungen, neueWerte, pruefeVersion, versionVon, type StammdatenErgebnis } from '../audit/aenderung';
import { protokolliereAnlage, schreibeAudit } from '../audit/audit.service';
import { wechsleStatus, type StatusErgebnis } from '../audit/statuswechsel';
import type { Database } from '../db/client';
import { DB } from '../db/db.module';
import { fahrer, fahrzeug, kunde } from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';
import type { FahrerAendern, FahrerErstellen, KundeAendern, KundeErstellen } from './dto';

@Injectable()
export class KundeService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // --- Kunde ---
  async erstelleKunde(principal: Principal, p: KundeErstellen): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(kunde)
        .values({
          mandantId: principal.mandantId ?? PLACEHOLDER_MANDANT_ID,
          firmenname: p.firmenname,
          handelsregisternummer: p.handelsregisternummer ?? null,
          ustId: p.ustId ?? null,
          strasse: p.strasse ?? null,
          plz: p.plz ?? null,
          ort: p.ort ?? null,
          land: p.land,
        })
        .returning();
      await protokolliereAnlage(tx, principal, 'kunde', row!.id, row);
      return { id: row!.id };
    });
  }

  async listeKunden(
    mandantId: string | undefined,
    opts: { status?: string; limit: number; offset: number },
  ): Promise<{ eintraege: (typeof kunde.$inferSelect)[]; gesamt: number }> {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
    const filter = and(
      eq(kunde.mandantId, mandant),
      opts.status ? eq(kunde.status, opts.status) : undefined,
    );
    const [eintraege, [zaehler]] = await Promise.all([
      this.db.select().from(kunde).where(filter).orderBy(desc(kunde.erstelltAm)).limit(opts.limit).offset(opts.offset),
      this.db.select({ n: sql<number>`count(*)::int` }).from(kunde).where(filter),
    ]);
    return { eintraege, gesamt: zaehler?.n ?? 0 };
  }

  async holeKunde(id: string): Promise<typeof kunde.$inferSelect> {
    const [row] = await this.db.select().from(kunde).where(eq(kunde.id, id));
    if (!row) {
      throw new NotFoundException('Kunde nicht gefunden');
    }
    return row;
  }

  /**
   * Stammdaten ändern: nur geänderte Felder, mit Versionsprüfung und
   * Audit-Eintrag (alt/neu) in derselben Transaktion.
   */
  async aendereKunde(principal: Principal, id: string, p: KundeAendern): Promise<StammdatenErgebnis> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    const { version, ...eingabe } = p;
    return this.db.transaction(async (tx) => {
      const [vorher] = await tx
        .select()
        .from(kunde)
        .where(and(eq(kunde.id, id), eq(kunde.mandantId, mandant)))
        .for('update');
      if (!vorher) {
        throw new NotFoundException('Kunde nicht gefunden');
      }
      pruefeVersion(vorher.aktualisiertAm, version);
      const a = ermittleAenderungen(vorher, eingabe);
      if (a.felder.length === 0) {
        return { id, version: versionVon(vorher.aktualisiertAm), geaendert: [] };
      }
      const jetzt = new Date();
      await tx
        .update(kunde)
        .set({ ...neueWerte(eingabe, a), aktualisiertAm: jetzt })
        .where(eq(kunde.id, id));
      await schreibeAudit(tx, principal, {
        aktion: 'PATCH',
        entitaetTyp: 'kunde',
        entitaetId: id,
        altWert: a.alt,
        neuWert: a.neu,
      });
      return { id, version: versionVon(jetzt), geaendert: a.felder };
    });
  }

  async aendereKundeStatus(principal: Principal, id: string, nach: KundeStatus): Promise<StatusErgebnis<KundeStatus>> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    return wechsleStatus(this.db, principal, {
      entitaetTyp: 'kunde_status',
      id,
      nach,
      nichtGefunden: 'Kunde nicht gefunden',
      lade: async (tx) =>
        (
          await tx
            .select({ status: kunde.status })
            .from(kunde)
            .where(and(eq(kunde.id, id), eq(kunde.mandantId, mandant)))
            .for('update')
        )[0],
      istStatus: istKundeStatus,
      erlaubt: istKundeUebergangErlaubt,
      speichere: async (tx, werte) => {
        await tx
          .update(kunde)
          .set({ ...werte, aktualisiertAm: new Date() })
          .where(eq(kunde.id, id));
      },
    });
  }

  // --- Fahrer ---
  async erstelleFahrer(principal: Principal, kundeId: string, p: FahrerErstellen): Promise<{ id: string }> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    return this.db.transaction(async (tx) => {
      const [k] = await tx
        .select({ id: kunde.id })
        .from(kunde)
        .where(and(eq(kunde.id, kundeId), eq(kunde.mandantId, mandant)));
      if (!k) {
        throw new NotFoundException('Kunde nicht gefunden');
      }
      const [row] = await tx
        .insert(fahrer)
        .values({
          kundeId,
          name: p.name,
          fuehrerscheinKlasse: p.fuehrerscheinKlasse,
          fuehrerscheinNummer: p.fuehrerscheinNummer ?? null,
          fuehrerscheinGueltigBis: p.fuehrerscheinGueltigBis ? new Date(p.fuehrerscheinGueltigBis) : null,
        })
        .returning();
      await protokolliereAnlage(tx, principal, 'fahrer', row!.id, row);
      return { id: row!.id };
    });
  }

  async holeFahrer(id: string): Promise<typeof fahrer.$inferSelect> {
    const [row] = await this.db.select().from(fahrer).where(eq(fahrer.id, id));
    if (!row) {
      throw new NotFoundException('Fahrer nicht gefunden');
    }
    return row;
  }

  async aendereFahrer(principal: Principal, id: string, p: FahrerAendern): Promise<StammdatenErgebnis> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    const { version, fuehrerscheinGueltigBis, ...rest } = p;
    const eingabe = {
      ...rest,
      fuehrerscheinGueltigBis:
        fuehrerscheinGueltigBis === undefined
          ? undefined
          : fuehrerscheinGueltigBis === null
            ? null
            : new Date(fuehrerscheinGueltigBis),
    };
    return this.db.transaction(async (tx) => {
      const [vorher] = await tx.select().from(fahrer).where(eq(fahrer.id, id)).for('update');
      const [besitzer] = vorher
        ? await tx.select({ mandantId: kunde.mandantId }).from(kunde).where(eq(kunde.id, vorher.kundeId))
        : [];
      if (!vorher || besitzer?.mandantId !== mandant) {
        throw new NotFoundException('Fahrer nicht gefunden');
      }
      pruefeVersion(vorher.aktualisiertAm, version);
      const a = ermittleAenderungen(vorher, eingabe);
      if (a.felder.length === 0) {
        return { id, version: versionVon(vorher.aktualisiertAm), geaendert: [] };
      }
      const jetzt = new Date();
      await tx
        .update(fahrer)
        .set({ ...neueWerte(eingabe, a), aktualisiertAm: jetzt })
        .where(eq(fahrer.id, id));
      await schreibeAudit(tx, principal, {
        aktion: 'PATCH',
        entitaetTyp: 'fahrer',
        entitaetId: id,
        altWert: a.alt,
        neuWert: a.neu,
      });
      return { id, version: versionVon(jetzt), geaendert: a.felder };
    });
  }

  async listeFahrer(kundeId: string): Promise<(typeof fahrer.$inferSelect)[]> {
    return this.db.select().from(fahrer).where(eq(fahrer.kundeId, kundeId)).orderBy(desc(fahrer.erstelltAm));
  }

  async aendereFahrerStatus(principal: Principal, id: string, nach: FahrerStatus): Promise<StatusErgebnis<FahrerStatus>> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    return wechsleStatus(this.db, principal, {
      entitaetTyp: 'fahrer_status',
      id,
      nach,
      nichtGefunden: 'Fahrer nicht gefunden',
      lade: async (tx) =>
        (
          await tx
            .select({ status: fahrer.status })
            .from(fahrer)
            .innerJoin(kunde, eq(fahrer.kundeId, kunde.id))
            .where(and(eq(fahrer.id, id), eq(kunde.mandantId, mandant)))
            .for('update', { of: fahrer })
        )[0],
      istStatus: istFahrerStatus,
      erlaubt: istFahrerUebergangErlaubt,
      // Jede Prüfentscheidung (Freigabe, Sperre, Ablehnung) ist eine Prüfung (R-22).
      zusatz: (v) => (v.status !== nach ? { letztePruefungAm: new Date() } : {}),
      speichere: async (tx, werte) => {
        await tx
          .update(fahrer)
          .set({ ...werte, aktualisiertAm: new Date() })
          .where(eq(fahrer.id, id));
      },
    });
  }

  /** Darf der Fahrer das Fahrzeug fahren? (R-22) */
  async einsatzbereit(fahrerId: string, fahrzeugId: string, stichtag: Date): Promise<EinsatzErgebnis> {
    const [f] = await this.db.select().from(fahrer).where(eq(fahrer.id, fahrerId));
    if (!f) {
      throw new NotFoundException('Fahrer nicht gefunden');
    }
    const [fz] = await this.db
      .select({ benoetigt: fahrzeug.benoetigteFuehrerscheinklasse })
      .from(fahrzeug)
      .where(eq(fahrzeug.id, fahrzeugId));
    if (!fz) {
      throw new NotFoundException('Fahrzeug nicht gefunden');
    }
    return bewerteFahrerEinsatz(
      {
        status: f.status,
        fuehrerscheinKlasse: f.fuehrerscheinKlasse,
        fuehrerscheinGueltigBis: f.fuehrerscheinGueltigBis,
      },
      fz.benoetigt,
      stichtag,
    );
  }

  /** Fahrer, deren Führerschein vor `bis` abläuft/abgelaufen ist (Sperre bei Ablauf). */
  async faelligeFuehrerscheine(
    mandantId: string | undefined,
    bis: Date,
  ): Promise<{ fahrerId: string; name: string; kundeId: string; gueltigBis: string | null }[]> {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
    const rows = await this.db
      .select({
        fahrerId: fahrer.id,
        name: fahrer.name,
        kundeId: fahrer.kundeId,
        gueltigBis: fahrer.fuehrerscheinGueltigBis,
        status: fahrer.status,
      })
      .from(fahrer)
      .innerJoin(kunde, eq(fahrer.kundeId, kunde.id))
      .where(eq(kunde.mandantId, mandant));

    return rows
      .filter((r) => r.status !== 'archiviert' && r.status !== 'abgelehnt')
      .filter((r) => r.gueltigBis === null || r.gueltigBis.getTime() < bis.getTime())
      .map((r) => ({
        fahrerId: r.fahrerId,
        name: r.name,
        kundeId: r.kundeId,
        gueltigBis: r.gueltigBis ? r.gueltigBis.toISOString() : null,
      }));
  }
}
