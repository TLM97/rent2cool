import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  istAbweichungStatus,
  istAbweichungUebergangErlaubt,
  type AbweichungStatus,
  type Principal,
} from '@rent2cool/shared';
import { protokolliereAnlage } from '../audit/audit.service';
import { wechsleStatus, type StatusErgebnis } from '../audit/statuswechsel';
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

  async erstelle(principal: Principal, p: AbweichungErstellen): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(abweichung)
        .values({
          mandantId: principal.mandantId ?? PLACEHOLDER_MANDANT_ID,
          bezugTyp: p.bezugTyp,
          bezugId: p.bezugId,
          beschreibung: p.beschreibung,
          schweregrad: p.schweregrad ?? null,
        })
        .returning();
      await protokolliereAnlage(tx, principal, 'abweichung', row!.id, row);
      return { id: row!.id };
    });
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
      this.db
        .select()
        .from(abweichung)
        .where(filter)
        .orderBy(desc(abweichung.erfasstAm))
        .limit(opts.limit)
        .offset(opts.offset),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(abweichung)
        .where(filter),
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

  /** Status und Bewertungsfelder ändern (auch ohne Statuswechsel, z. B. Maßnahmen ergänzen). */
  async aendereStatus(
    principal: Principal,
    id: string,
    nach: AbweichungStatus,
    felder: { bewertung?: string; massnahmen?: string; verantwortlich?: string },
  ): Promise<StatusErgebnis<AbweichungStatus>> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    return wechsleStatus(this.db, principal, {
      entitaetTyp: 'abweichung_status',
      id,
      nach,
      nichtGefunden: 'Abweichung nicht gefunden',
      lade: async (tx) =>
        (
          await tx
            .select({
              status: abweichung.status,
              bewertung: abweichung.bewertung,
              massnahmen: abweichung.massnahmen,
              verantwortlich: abweichung.verantwortlich,
              geschlossenAm: abweichung.geschlossenAm,
            })
            .from(abweichung)
            .where(and(eq(abweichung.id, id), eq(abweichung.mandantId, mandant)))
            .for('update')
        )[0],
      istStatus: istAbweichungStatus,
      erlaubt: istAbweichungUebergangErlaubt,
      zusatz: (a) => ({
        ...felder,
        ...(nach === 'geschlossen' && !a.geschlossenAm ? { geschlossenAm: new Date() } : {}),
      }),
      speichere: async (tx, werte) => {
        await tx
          .update(abweichung)
          .set({ ...werte, aktualisiertAm: new Date() })
          .where(eq(abweichung.id, id));
      },
    });
  }
}
