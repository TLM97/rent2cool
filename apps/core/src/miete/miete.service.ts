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
import { wechsleStatus, type StatusErgebnis } from '../audit/statuswechsel';
import type { Database, Transaktion } from '../db/client';
import { DB } from '../db/db.module';
import { fahrzeug, kunde, miete } from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';
import { FahrzeugService } from '../fahrzeug/fahrzeug.service';
import { KundeService } from '../kunde/kunde.service';
import { BerichtService } from '../bericht/bericht.service';
import type { MieteErstellen } from './dto';

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
    },
  ): Promise<string[]> {
    const gruende: string[] = [];

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
      gruende.push('Fahrzeug ist im gewünschten Zeitraum bereits gebucht');
    }

    return gruende;
  }

  async erstelle(
    mandantId: string | undefined,
    p: MieteErstellen,
  ): Promise<{ id: string; status: MieteStatus; idempotent: boolean }> {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
    const start = new Date(p.startGeplant);
    const ende = new Date(p.endeGeplant);
    if (ende.getTime() <= start.getTime()) {
      throw new BadRequestException('endeGeplant muss nach startGeplant liegen');
    }

    // Idempotenz (D-003): gleicher Key -> bestehende Miete zurückgeben.
    if (p.idempotencyKey) {
      const [vorhanden] = await this.db
        .select({ id: miete.id, status: miete.status })
        .from(miete)
        .where(and(eq(miete.mandantId, mandant), eq(miete.idempotencyKey, p.idempotencyKey)));
      if (vorhanden) {
        return { id: vorhanden.id, status: vorhanden.status as MieteStatus, idempotent: true };
      }
    }

    const gruende = await this.pruefeBuchung(mandant, {
      kundeId: p.kundeId,
      fahrzeugId: p.fahrzeugId,
      fahrerId: p.fahrerId,
      auslandsfahrtGeplant: p.auslandsfahrtGeplant,
      startGeplant: start,
      endeGeplant: ende,
    });
    if (gruende.length > 0) {
      throw new ConflictException({ fehler: 'Buchung abgelehnt', gruende });
    }

    try {
      const [row] = await this.db
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
        .returning({ id: miete.id });
      return { id: row!.id, status: 'bestaetigt', idempotent: false };
    } catch (e: unknown) {
      // Race auf idempotency_key: bestehende Miete zurückgeben.
      if (p.idempotencyKey && String(e).includes('23505')) {
        const [vorhanden] = await this.db
          .select({ id: miete.id, status: miete.status })
          .from(miete)
          .where(and(eq(miete.mandantId, mandant), eq(miete.idempotencyKey, p.idempotencyKey)));
        if (vorhanden) {
          return { id: vorhanden.id, status: vorhanden.status as MieteStatus, idempotent: true };
        }
      }
      throw e;
    }
  }

  async liste(
    mandantId: string | undefined,
    opts: { status?: string; kundeId?: string; fahrzeugId?: string; limit: number; offset: number },
  ): Promise<{ eintraege: (typeof miete.$inferSelect)[]; gesamt: number }> {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
    const filter = and(
      eq(miete.mandantId, mandant),
      opts.status ? eq(miete.status, opts.status) : undefined,
      opts.kundeId ? eq(miete.kundeId, opts.kundeId) : undefined,
      opts.fahrzeugId ? eq(miete.fahrzeugId, opts.fahrzeugId) : undefined,
    );
    const [eintraege, [zaehler]] = await Promise.all([
      this.db.select().from(miete).where(filter).orderBy(desc(miete.startGeplant)).limit(opts.limit).offset(opts.offset),
      this.db.select({ n: sql<number>`count(*)::int` }).from(miete).where(filter),
    ]);
    return { eintraege, gesamt: zaehler?.n ?? 0 };
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
        await tx
          .update(miete)
          .set({ ...werte, aktualisiertAm: new Date() })
          .where(eq(miete.id, id));
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
