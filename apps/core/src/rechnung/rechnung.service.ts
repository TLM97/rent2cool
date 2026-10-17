import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  formatRechnungsnummer,
  istRechnungStatus,
  istRechnungUebergangErlaubt,
  rechneBetraege,
  type RechnungStatus,
} from '@rent2cool/shared';
import type { Env } from '../config/env';
import type { Database } from '../db/client';
import { DB } from '../db/db.module';
import { rechnung, rechnungSequenz } from '../db/schema';
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

  private async naechsteNummer(mandant: string, jahr: number): Promise<number> {
    const [row] = await this.db
      .insert(rechnungSequenz)
      .values({ mandantId: mandant, jahr, letzteNummer: 1 })
      .onConflictDoUpdate({
        target: [rechnungSequenz.mandantId, rechnungSequenz.jahr],
        set: { letzteNummer: sql`${rechnungSequenz.letzteNummer} + 1` },
      })
      .returning({ nr: rechnungSequenz.letzteNummer });
    return row!.nr;
  }

  async erstelle(mandantId: string | undefined, p: RechnungErstellen) {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
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

    const nr = await this.naechsteNummer(mandant, jahr);
    const rechnungsnummer = formatRechnungsnummer(jahr, nr);

    const [row] = await this.db
      .insert(rechnung)
      .values({
        mandantId: mandant,
        kundeId: m.kundeId,
        mieteId: m.id,
        rechnungsnummer,
        zeitraumVon: von,
        zeitraumBis: bis,
        nettoCent: betraege.nettoCent,
        steuerSatz: betraege.steuerSatzProzent,
        steuerCent: betraege.steuerCent,
        bruttoCent: betraege.bruttoCent,
        waehrung,
        status: 'entwurf',
      })
      .returning({ id: rechnung.id });

    return {
      id: row!.id,
      rechnungsnummer,
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
  ): Promise<{ eintraege: (typeof rechnung.$inferSelect)[]; gesamt: number }> {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
    const filter = and(
      eq(rechnung.mandantId, mandant),
      opts.status ? eq(rechnung.status, opts.status) : undefined,
      opts.kundeId ? eq(rechnung.kundeId, opts.kundeId) : undefined,
      opts.mieteId ? eq(rechnung.mieteId, opts.mieteId) : undefined,
    );
    const [eintraege, [zaehler]] = await Promise.all([
      this.db.select().from(rechnung).where(filter).orderBy(desc(rechnung.erstelltAm)).limit(opts.limit).offset(opts.offset),
      this.db.select({ n: sql<number>`count(*)::int` }).from(rechnung).where(filter),
    ]);
    return { eintraege, gesamt: zaehler?.n ?? 0 };
  }

  async holeRechnung(id: string): Promise<typeof rechnung.$inferSelect> {
    const [row] = await this.db.select().from(rechnung).where(eq(rechnung.id, id));
    if (!row) {
      throw new NotFoundException('Rechnung nicht gefunden');
    }
    return row;
  }

  async aendereStatus(id: string, nach: RechnungStatus): Promise<{ id: string; status: RechnungStatus }> {
    const r = await this.holeRechnung(id);
    const von = r.status;
    if (!istRechnungStatus(von)) {
      throw new BadRequestException(`Unbekannter aktueller Status: ${von}`);
    }
    if (von !== nach && !istRechnungUebergangErlaubt(von, nach)) {
      throw new BadRequestException(`Statusübergang "${von}" -> "${nach}" ist nicht erlaubt`);
    }
    const satz: Partial<typeof rechnung.$inferInsert> = { status: nach, aktualisiertAm: new Date() };
    if (nach === 'gestellt' && !r.gestelltAm) {
      satz.gestelltAm = new Date();
    }
    if (nach === 'bezahlt' && !r.bezahltAm) {
      satz.bezahltAm = new Date();
    }
    await this.db.update(rechnung).set(satz).where(eq(rechnung.id, id));

    // Beim Stellen die Miete als abgerechnet markieren (falls noch beendet).
    if (nach === 'gestellt') {
      const m = await this.mieten.holeMiete(r.mieteId);
      if (m.status === 'beendet') {
        await this.mieten.aendereStatus(r.mieteId, 'abgerechnet');
      }
    }
    return { id, status: nach };
  }
}
