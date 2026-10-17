import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  formatRechnungsnummer,
  istRechnungStatus,
  istRechnungUebergangErlaubt,
  rechneBetraege,
  type Principal,
  type RechnungStatus,
} from '@rent2cool/shared';
import { protokolliereAnlage } from '../audit/audit.service';
import { wechsleStatus, type StatusErgebnis } from '../audit/statuswechsel';
import type { Env } from '../config/env';
import type { Database, Transaktion } from '../db/client';
import { DB } from '../db/db.module';
import { kunde, miete, rechnung, rechnungSequenz } from '../db/schema';
import { istPgFehler, PG_FEHLER } from '../db/fehler';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';
import { MieteService } from '../miete/miete.service';
import type { RechnungErstellen } from './dto';

@Injectable()
export class RechnungService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly config: ConfigService<Env, true>,
    private readonly mieten: MieteService,
  ) {}

  /** Nächste Nummer; in der Transaktion des Anlegens, damit ein Abbruch keine Lücke hinterlässt. */
  private async naechsteNummer(tx: Transaktion, mandant: string, jahr: number): Promise<number> {
    const [row] = await tx
      .insert(rechnungSequenz)
      .values({ mandantId: mandant, jahr, letzteNummer: 1 })
      .onConflictDoUpdate({
        target: [rechnungSequenz.mandantId, rechnungSequenz.jahr],
        set: { letzteNummer: sql`${rechnungSequenz.letzteNummer} + 1` },
      })
      .returning({ nr: rechnungSequenz.letzteNummer });
    return row!.nr;
  }

  async erstelle(principal: Principal, p: RechnungErstellen) {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    const m = await this.mieten.holeMiete(p.mieteId);
    if (m.mandantId !== mandant) {
      throw new NotFoundException('Miete nicht gefunden');
    }
    if (m.status !== 'beendet' && m.status !== 'abgerechnet') {
      throw new ConflictException(`Miete ist nicht beendet (Status ${m.status})`);
    }

    const [vorhanden] = await this.db
      .select({ id: rechnung.id })
      .from(rechnung)
      .where(eq(rechnung.mieteId, p.mieteId));
    if (vorhanden) {
      throw new ConflictException('Für diese Miete existiert bereits eine Rechnung');
    }

    const satz = p.steuerSatz ?? this.config.get('RECHNUNG_STEUERSATZ', { infer: true }) ?? 19;
    const waehrung = this.config.get('RECHNUNG_WAEHRUNG', { infer: true }) ?? 'EUR';
    const nettoCent = Math.round(p.netto * 100);
    const betraege = rechneBetraege(nettoCent, satz);
    const von = m.startIst ?? m.startGeplant;
    const bis = m.endeIst ?? m.endeGeplant;
    const jahr = new Date().getUTCFullYear();

    let row: typeof rechnung.$inferSelect;
    try {
      row = await this.db.transaction(async (tx) => {
        const nr = await this.naechsteNummer(tx, mandant, jahr);
        const [neu] = await tx
          .insert(rechnung)
          .values({
            mandantId: mandant,
            kundeId: m.kundeId,
            mieteId: m.id,
            rechnungsnummer: formatRechnungsnummer(jahr, nr),
            zeitraumVon: von,
            zeitraumBis: bis,
            nettoCent: betraege.nettoCent,
            steuerSatz: betraege.steuerSatzProzent,
            steuerCent: betraege.steuerCent,
            bruttoCent: betraege.bruttoCent,
            waehrung,
            status: 'entwurf',
          })
          .returning();
        await protokolliereAnlage(tx, principal, 'rechnung', neu!.id, neu);
        return neu!;
      });
    } catch (e: unknown) {
      // Gleichzeitiges Anlegen zur selben Miete: die Vorabprüfung sah noch keine Rechnung.
      if (istPgFehler(e, PG_FEHLER.EINDEUTIG, 'uq_rechnung_miete')) {
        throw new ConflictException('Für diese Miete existiert bereits eine Rechnung');
      }
      throw e;
    }

    return {
      id: row.id,
      rechnungsnummer: row.rechnungsnummer,
      status: 'entwurf' as RechnungStatus,
      nettoCent: betraege.nettoCent,
      steuerCent: betraege.steuerCent,
      bruttoCent: betraege.bruttoCent,
      waehrung,
    };
  }

  async liste(
    mandantId: string | undefined,
    opts: { status?: string; kundeId?: string; mieteId?: string; limit: number; offset: number },
  ): Promise<{
    eintraege: (typeof rechnung.$inferSelect & { kundeFirmenname: string })[];
    gesamt: number;
  }> {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
    const filter = and(
      eq(rechnung.mandantId, mandant),
      opts.status ? eq(rechnung.status, opts.status) : undefined,
      opts.kundeId ? eq(rechnung.kundeId, opts.kundeId) : undefined,
      opts.mieteId ? eq(rechnung.mieteId, opts.mieteId) : undefined,
    );
    const [zeilen, [zaehler]] = await Promise.all([
      this.db
        .select({ r: rechnung, kundeFirmenname: kunde.firmenname })
        .from(rechnung)
        .innerJoin(kunde, eq(rechnung.kundeId, kunde.id))
        .where(filter)
        .orderBy(desc(rechnung.erstelltAm))
        .limit(opts.limit)
        .offset(opts.offset),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(rechnung)
        .where(filter),
    ]);
    return {
      eintraege: zeilen.map((z) => ({ ...z.r, kundeFirmenname: z.kundeFirmenname })),
      gesamt: zaehler?.n ?? 0,
    };
  }

  async holeRechnung(id: string): Promise<typeof rechnung.$inferSelect> {
    const [row] = await this.db.select().from(rechnung).where(eq(rechnung.id, id));
    if (!row) {
      throw new NotFoundException('Rechnung nicht gefunden');
    }
    return row;
  }

  /** Status ändern; beim Stellen wird die Miete in derselben Transaktion abgerechnet. */
  async aendereStatus(
    principal: Principal,
    id: string,
    nach: RechnungStatus,
  ): Promise<StatusErgebnis<RechnungStatus>> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    let mieteId = '';
    return wechsleStatus(this.db, principal, {
      entitaetTyp: 'rechnung_status',
      id,
      nach,
      nichtGefunden: 'Rechnung nicht gefunden',
      lade: async (tx) => {
        const [r] = await tx
          .select({
            status: rechnung.status,
            gestelltAm: rechnung.gestelltAm,
            bezahltAm: rechnung.bezahltAm,
            mieteId: rechnung.mieteId,
          })
          .from(rechnung)
          .where(and(eq(rechnung.id, id), eq(rechnung.mandantId, mandant)))
          .for('update');
        mieteId = r?.mieteId ?? '';
        return r;
      },
      istStatus: istRechnungStatus,
      erlaubt: istRechnungUebergangErlaubt,
      zusatz: (r) => ({
        ...(nach === 'gestellt' && !r.gestelltAm ? { gestelltAm: new Date() } : {}),
        ...(nach === 'bezahlt' && !r.bezahltAm ? { bezahltAm: new Date() } : {}),
      }),
      speichere: async (tx, werte) => {
        await tx
          .update(rechnung)
          .set({ ...werte, aktualisiertAm: new Date() })
          .where(eq(rechnung.id, id));
      },
      danach: async (tx) => {
        if (nach !== 'gestellt') return;
        const [m] = await tx
          .select({ status: miete.status })
          .from(miete)
          .where(eq(miete.id, mieteId));
        if (m?.status === 'beendet') {
          await this.mieten.aendereStatus(principal, mieteId, 'abgerechnet', tx);
        }
      },
    });
  }
}
