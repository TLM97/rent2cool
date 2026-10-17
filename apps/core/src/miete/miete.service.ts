import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import {
  istMieteStatus,
  istMieteUebergangErlaubt,
  type MieteStatus,
  type Principal,
  type TemperaturNachweis,
} from '@rent2cool/shared';
import { protokolliereAnlage } from '../audit/audit.service';
import { wechsleStatus, type StatusErgebnis } from '../audit/statuswechsel';
import type { Database, Transaktion } from '../db/client';
import { DB } from '../db/db.module';
import { fahrzeug, kunde, miete } from '../db/schema';
import { istPgFehler, mitWiederholung, PG_FEHLER } from '../db/fehler';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';
import { FahrzeugService } from '../fahrzeug/fahrzeug.service';
import { KundeService } from '../kunde/kunde.service';
import { standortNutzbar } from '../standort/standort.service';
import { BerichtService } from '../bericht/bericht.service';
import type { MieteErstellen } from './dto';

/** Ablehnungsgrund bei Überschneidung – gleich, ob Vorabprüfung oder DB-Regel greift. */
const UEBERSCHNEIDUNG = 'Fahrzeug ist im gewünschten Zeitraum bereits gebucht';
/** Exclusion-Constraint aus Migration 0010 (Fahrzeug × Zeitraum, nur bestätigt/aktiv). */
const UEBERSCHNEIDUNG_REGEL = 'ex_miete_fahrzeug_zeitraum';

@Injectable()
export class MieteService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly fahrzeuge: FahrzeugService,
    private readonly kunden: KundeService,
    private readonly berichte: BerichtService,
  ) {}

  /** Prüft die Buchungsregeln und liefert die Ablehnungsgründe (leer = ok). */
  async pruefeBuchung(
    mandant: string,
    p: {
      kundeId: string;
      fahrzeugId: string;
      fahrerId?: string;
      auslandsfahrtGeplant: boolean;
      startGeplant: Date;
      endeGeplant: Date;
      standortAbholId?: string;
      standortRueckgabeId?: string;
    },
  ): Promise<string[]> {
    const gruende: string[] = [];

    // Übergabe- und Rückgabeort: Standort des Mandanten und aktiv (D-011).
    for (const [id, rolle] of [
      [p.standortAbholId, 'Abholung'],
      [p.standortRueckgabeId, 'Rückgabe'],
    ] as const) {
      const grund = id ? await standortNutzbar(this.db, mandant, id, rolle) : undefined;
      if (grund) gruende.push(grund);
    }

    // Kunde muss freigegeben sein (D-010).
    const [k] = await this.db
      .select({ status: kunde.status })
      .from(kunde)
      .where(and(eq(kunde.id, p.kundeId), eq(kunde.mandantId, mandant)));
    if (!k) {
      gruende.push('Kunde nicht gefunden');
    } else if (k.status !== 'freigegeben') {
      gruende.push(`Kunde ist nicht freigegeben (Status ${k.status})`);
    }

    // Fahrzeug + Fahrtenschreiber-Regel bei Auslandsfahrt (D-006).
    const [fz] = await this.db
      .select({ tacho: fahrzeug.hatFahrtenschreiber })
      .from(fahrzeug)
      .where(and(eq(fahrzeug.id, p.fahrzeugId), eq(fahrzeug.mandantId, mandant)));
    if (!fz) {
      gruende.push('Fahrzeug nicht gefunden');
    } else if (p.auslandsfahrtGeplant && !fz.tacho) {
      gruende.push('Auslandsfahrt geplant, aber Fahrzeug hat keinen Fahrtenschreiber (D-006)');
    }

    // Fahrzeug buchbar (Status + gültige Kalibrierung).
    if (fz) {
      const b = await this.fahrzeuge.buchbarkeit(p.fahrzeugId, p.startGeplant);
      if (!b.buchbar) {
        gruende.push(...b.gruende.map((g) => `Fahrzeug: ${g}`));
      }
    }

    // Fahrer (falls zugewiesen) einsatzbereit (R-22).
    if (p.fahrerId && fz) {
      const e = await this.kunden.einsatzbereit(p.fahrerId, p.fahrzeugId, p.startGeplant);
      if (!e.einsatzbereit) {
        gruende.push(...e.gruende.map((g) => `Fahrer: ${g}`));
      }
    }

    // Keine Doppelbuchung desselben Fahrzeugs im Zeitraum.
    const [ueberlappung] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(miete)
      .where(
        and(
          eq(miete.fahrzeugId, p.fahrzeugId),
          inArray(miete.status, ['bestaetigt', 'aktiv']),
          lt(miete.startGeplant, p.endeGeplant),
          gt(miete.endeGeplant, p.startGeplant),
        ),
      );
    if ((ueberlappung?.n ?? 0) > 0) {
      gruende.push(UEBERSCHNEIDUNG);
    }

    return gruende;
  }

  /**
   * Buchung anlegen. Audit (vollständige Miete) in derselben Transaktion; eine
   * idempotente Wiederholung legt nichts an und protokolliert daher nichts.
   */
  async erstelle(
    principal: Principal,
    p: MieteErstellen,
  ): Promise<{ id: string; status: MieteStatus; idempotent: boolean }> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    const start = new Date(p.startGeplant);
    const ende = new Date(p.endeGeplant);
    if (ende.getTime() <= start.getTime()) {
      throw new BadRequestException('endeGeplant muss nach startGeplant liegen');
    }

    // Idempotenz (D-003): gleicher Key -> bestehende Miete zurückgeben.
    const vorhandene = async (ausfuehrer: Database | Transaktion = this.db) => {
      if (!p.idempotencyKey) return undefined;
      const [v] = await ausfuehrer
        .select({ id: miete.id, status: miete.status })
        .from(miete)
        .where(and(eq(miete.mandantId, mandant), eq(miete.idempotencyKey, p.idempotencyKey)));
      return v ? { id: v.id, status: v.status as MieteStatus, idempotent: true } : undefined;
    };
    const schonDa = await vorhandene();
    if (schonDa) return schonDa;

    const gruende = await this.pruefeBuchung(mandant, {
      kundeId: p.kundeId,
      fahrzeugId: p.fahrzeugId,
      fahrerId: p.fahrerId,
      auslandsfahrtGeplant: p.auslandsfahrtGeplant,
      startGeplant: start,
      endeGeplant: ende,
      standortAbholId: p.standortAbholId,
      standortRueckgabeId: p.standortRueckgabeId,
    });
    if (gruende.length > 0) {
      // Eine gleichzeitige Wiederholung derselben Buchung sieht die erste als
      // „Überschneidung“ – dann die vorhandene zurückgeben statt abzulehnen.
      const inzwischen = await vorhandene();
      if (inzwischen) return inzwischen;
      throw new ConflictException({ fehler: 'Buchung abgelehnt', gruende });
    }

    try {
      // Mehrere Deadlock-Wiederholungen nur als Rückfall: Die Sperre je Fahrzeug
      // unten verhindert Deadlocks gleichzeitiger Buchungen desselben Fahrzeugs.
      return await mitWiederholung(() =>
        this.db.transaction(async (tx) => {
          // Buchungen desselben Fahrzeugs nacheinander (nur innerhalb der Transaktion).
          // Ohne diese Sperre können sich gleichzeitige Prüfungen der
          // Überschneidungs-Regel gegenseitig blockieren (Deadlock, ~1 s Wartezeit).
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${p.fahrzeugId}, 0))`);
          const innen = await vorhandene(tx);
          if (innen) return innen;
          const [row] = await tx
            .insert(miete)
            .values({
              mandantId: mandant,
              kundeId: p.kundeId,
              fahrzeugId: p.fahrzeugId,
              fahrerId: p.fahrerId ?? null,
              standortAbholId: p.standortAbholId ?? null,
              standortRueckgabeId: p.standortRueckgabeId ?? null,
              region: p.region ?? null,
              startGeplant: start,
              endeGeplant: ende,
              tarif: p.tarif ?? null,
              auslandsfahrtGeplant: p.auslandsfahrtGeplant,
              temperaturprofil: p.temperaturprofil ?? null,
              status: 'bestaetigt',
              idempotencyKey: p.idempotencyKey ?? null,
            })
            .returning();
          await protokolliereAnlage(tx, principal, 'miete', row!.id, row);
          return { id: row!.id, status: 'bestaetigt' as const, idempotent: false };
        }),
      );
    } catch (e: unknown) {
      // Gleichzeitige Buchung hat das Fahrzeug im Zeitraum zuerst bekommen (DB-Regel).
      if (istPgFehler(e, PG_FEHLER.AUSSCHLUSS, UEBERSCHNEIDUNG_REGEL)) {
        throw new ConflictException({ fehler: 'Buchung abgelehnt', gruende: [UEBERSCHNEIDUNG] });
      }
      // Gleichzeitige Wiederholung mit demselben idempotency_key (anderes Fahrzeug o. Ä.).
      if (istPgFehler(e, PG_FEHLER.EINDEUTIG, 'uq_miete_idempotency')) {
        const inzwischen = await vorhandene();
        if (inzwischen) return inzwischen;
      }
      throw e;
    }
  }

  /** Liste mit Kennzeichen und Firmenname (ein Join statt einer Abfrage je Zeile, D-003). */
  async liste(
    mandantId: string | undefined,
    opts: { status?: string; kundeId?: string; fahrzeugId?: string; limit: number; offset: number },
  ): Promise<{
    eintraege: (typeof miete.$inferSelect & {
      fahrzeugKennzeichen: string;
      kundeFirmenname: string;
    })[];
    gesamt: number;
  }> {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
    const filter = and(
      eq(miete.mandantId, mandant),
      opts.status ? eq(miete.status, opts.status) : undefined,
      opts.kundeId ? eq(miete.kundeId, opts.kundeId) : undefined,
      opts.fahrzeugId ? eq(miete.fahrzeugId, opts.fahrzeugId) : undefined,
    );
    const [zeilen, [zaehler]] = await Promise.all([
      this.db
        .select({
          m: miete,
          fahrzeugKennzeichen: fahrzeug.kennzeichen,
          kundeFirmenname: kunde.firmenname,
        })
        .from(miete)
        .innerJoin(fahrzeug, eq(miete.fahrzeugId, fahrzeug.id))
        .innerJoin(kunde, eq(miete.kundeId, kunde.id))
        .where(filter)
        .orderBy(desc(miete.startGeplant))
        .limit(opts.limit)
        .offset(opts.offset),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(miete)
        .where(filter),
    ]);
    return {
      eintraege: zeilen.map((z) => ({
        ...z.m,
        fahrzeugKennzeichen: z.fahrzeugKennzeichen,
        kundeFirmenname: z.kundeFirmenname,
      })),
      gesamt: zaehler?.n ?? 0,
    };
  }

  async holeMiete(id: string): Promise<typeof miete.$inferSelect> {
    const [row] = await this.db.select().from(miete).where(eq(miete.id, id));
    if (!row) {
      throw new NotFoundException('Miete nicht gefunden');
    }
    return row;
  }

  /**
   * Status ändern; `ausfuehrer` erlaubt den Aufruf innerhalb einer laufenden
   * Transaktion (z. B. Rechnung stellen → Miete abgerechnet).
   */
  async aendereStatus(
    principal: Principal,
    id: string,
    nach: MieteStatus,
    ausfuehrer: Database | Transaktion = this.db,
  ): Promise<StatusErgebnis<MieteStatus>> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    return wechsleStatus(ausfuehrer, principal, {
      entitaetTyp: 'miete_status',
      id,
      nach,
      nichtGefunden: 'Miete nicht gefunden',
      lade: async (tx) =>
        (
          await tx
            .select({ status: miete.status, startIst: miete.startIst, endeIst: miete.endeIst })
            .from(miete)
            .where(and(eq(miete.id, id), eq(miete.mandantId, mandant)))
            .for('update')
        )[0],
      istStatus: istMieteStatus,
      erlaubt: istMieteUebergangErlaubt,
      zusatz: (m) => ({
        ...(nach === 'aktiv' && !m.startIst ? { startIst: new Date() } : {}),
        ...(nach === 'beendet' && !m.endeIst ? { endeIst: new Date() } : {}),
      }),
      speichere: async (tx, werte) => {
        try {
          await tx
            .update(miete)
            .set({ ...werte, aktualisiertAm: new Date() })
            .where(eq(miete.id, id));
        } catch (e: unknown) {
          // z. B. angefragt → bestätigt, während das Fahrzeug inzwischen anderweitig gebucht ist.
          if (istPgFehler(e, PG_FEHLER.AUSSCHLUSS, UEBERSCHNEIDUNG_REGEL)) {
            throw new ConflictException({
              fehler: 'Statuswechsel abgelehnt',
              gruende: [UEBERSCHNEIDUNG],
            });
          }
          throw e;
        }
      },
    });
  }

  /** Temperaturnachweis zu dieser Miete (bindet Fahrzeug + Zeitfenster der Miete). */
  async temperaturnachweis(id: string, profilOverride?: string): Promise<TemperaturNachweis> {
    const m = await this.holeMiete(id);
    const von = m.startIst ?? m.startGeplant;
    const bis = m.endeIst ?? m.endeGeplant;
    const profil = m.temperaturprofil ?? profilOverride ?? '2-8';
    return this.berichte.erzeuge({
      fahrzeugId: m.fahrzeugId,
      messgroesse: 'temperatur_laderaum',
      von: von.toISOString(),
      bis: bis.toISOString(),
      profilName: profil,
      lueckeSchwelleMin: 5,
    });
  }
}
