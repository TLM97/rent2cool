import {
  BadRequestException,
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
} from '@rent2cool/shared';
import type { Database } from '../db/client';
import { DB } from '../db/db.module';
import { fahrer, fahrzeug, kunde } from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';
import type { FahrerErstellen, KundeErstellen } from './dto';

@Injectable()
export class KundeService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // --- Kunde ---
  async erstelleKunde(mandantId: string | undefined, p: KundeErstellen): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(kunde)
      .values({
        mandantId: mandantId ?? PLACEHOLDER_MANDANT_ID,
        firmenname: p.firmenname,
        handelsregisternummer: p.handelsregisternummer ?? null,
        ustId: p.ustId ?? null,
        strasse: p.strasse ?? null,
        plz: p.plz ?? null,
        ort: p.ort ?? null,
        land: p.land,
      })
      .returning({ id: kunde.id });
    return { id: row!.id };
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

  async aendereKundeStatus(id: string, nach: KundeStatus): Promise<{ id: string; status: KundeStatus }> {
    const aktuell = await this.holeKunde(id);
    const von = aktuell.status;
    if (!istKundeStatus(von)) {
      throw new BadRequestException(`Unbekannter aktueller Status: ${von}`);
    }
    if (von === nach) {
      return { id, status: nach };
    }
    if (!istKundeUebergangErlaubt(von, nach)) {
      throw new BadRequestException(`Statusübergang "${von}" -> "${nach}" ist nicht erlaubt`);
    }
    await this.db.update(kunde).set({ status: nach, aktualisiertAm: new Date() }).where(eq(kunde.id, id));
    return { id, status: nach };
  }

  // --- Fahrer ---
  async erstelleFahrer(kundeId: string, p: FahrerErstellen): Promise<{ id: string }> {
    await this.holeKunde(kundeId); // 404, wenn Kunde fehlt
    const [row] = await this.db
      .insert(fahrer)
      .values({
        kundeId,
        name: p.name,
        fuehrerscheinKlasse: p.fuehrerscheinKlasse,
        fuehrerscheinNummer: p.fuehrerscheinNummer ?? null,
        fuehrerscheinGueltigBis: p.fuehrerscheinGueltigBis ? new Date(p.fuehrerscheinGueltigBis) : null,
      })
      .returning({ id: fahrer.id });
    return { id: row!.id };
  }

  async listeFahrer(kundeId: string): Promise<(typeof fahrer.$inferSelect)[]> {
    return this.db.select().from(fahrer).where(eq(fahrer.kundeId, kundeId)).orderBy(desc(fahrer.erstelltAm));
  }

  async aendereFahrerStatus(id: string, nach: FahrerStatus): Promise<{ id: string; status: FahrerStatus }> {
    const [row] = await this.db.select({ status: fahrer.status }).from(fahrer).where(eq(fahrer.id, id));
    if (!row) {
      throw new NotFoundException('Fahrer nicht gefunden');
    }
    const von = row.status;
    if (!istFahrerStatus(von)) {
      throw new BadRequestException(`Unbekannter aktueller Status: ${von}`);
    }
    if (von === nach) {
      return { id, status: nach };
    }
    if (!istFahrerUebergangErlaubt(von, nach)) {
      throw new BadRequestException(`Statusübergang "${von}" -> "${nach}" ist nicht erlaubt`);
    }
    await this.db
      .update(fahrer)
      .set({ status: nach, aktualisiertAm: new Date(), letztePruefungAm: new Date() })
      .where(eq(fahrer.id, id));
    return { id, status: nach };
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
