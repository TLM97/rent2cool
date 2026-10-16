import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  istAbweichungUebergangErlaubt,
  type AbweichungStatus,
} from '@rent2cool/shared';
import type { Database } from '../db/client';
import { DB } from '../db/db.module';
import { abweichung } from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';

export interface AbweichungErstellen {
  bezugTyp: string;
  bezugId: string;
  beschreibung: string;
  schweregrad?: string;
}

@Injectable()
export class AbweichungService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async erstelle(mandantId: string | undefined, p: AbweichungErstellen): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(abweichung)
      .values({
        mandantId: mandantId ?? PLACEHOLDER_MANDANT_ID,
        bezugTyp: p.bezugTyp,
        bezugId: p.bezugId,
        beschreibung: p.beschreibung,
        schweregrad: p.schweregrad ?? null,
      })
      .returning({ id: abweichung.id });
    return { id: row!.id };
  }

  async liste(
    mandantId: string | undefined,
    opts: { status?: string; limit: number; offset: number },
  ): Promise<{ eintraege: (typeof abweichung.$inferSelect)[]; gesamt: number }> {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
    const filter = and(
      eq(abweichung.mandantId, mandant),
      opts.status ? eq(abweichung.status, opts.status) : undefined,
    );
    const [eintraege, [zaehler]] = await Promise.all([
      this.db.select().from(abweichung).where(filter).orderBy(desc(abweichung.erfasstAm)).limit(opts.limit).offset(opts.offset),
      this.db.select({ n: sql<number>`count(*)::int` }).from(abweichung).where(filter),
    ]);
    return { eintraege, gesamt: zaehler?.n ?? 0 };
  }

  async hole(id: string): Promise<typeof abweichung.$inferSelect> {
    const [row] = await this.db.select().from(abweichung).where(eq(abweichung.id, id));
    if (!row) {
      throw new NotFoundException('Abweichung nicht gefunden');
    }
    return row;
  }

  async aendereStatus(
    id: string,
    nach: AbweichungStatus,
    felder: { bewertung?: string; massnahmen?: string; verantwortlich?: string },
  ): Promise<{ id: string; status: AbweichungStatus }> {
    const a = await this.hole(id);
    const von = a.status as AbweichungStatus;
    if (von !== nach && !istAbweichungUebergangErlaubt(von, nach)) {
      throw new BadRequestException(`Statusübergang "${von}" -> "${nach}" ist nicht erlaubt`);
    }
    const satz: Partial<typeof abweichung.$inferInsert> = { status: nach, aktualisiertAm: new Date() };
    if (felder.bewertung !== undefined) satz.bewertung = felder.bewertung;
    if (felder.massnahmen !== undefined) satz.massnahmen = felder.massnahmen;
    if (felder.verantwortlich !== undefined) satz.verantwortlich = felder.verantwortlich;
    if (nach === 'geschlossen') satz.geschlossenAm = new Date();
    await this.db.update(abweichung).set(satz).where(eq(abweichung.id, id));
    return { id, status: nach };
  }
}
