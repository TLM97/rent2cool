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
import { alias } from 'drizzle-orm/pg-core';
import { abweichung, alarm, fahrzeug, miete } from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';

export interface AbweichungErstellen {
  bezugTyp: string;
  bezugId: string;
  beschreibung: string;
  schweregrad?: string;
}

export type AbweichungMitBezug = typeof abweichung.$inferSelect & {
  bezugKennzeichen: string | null;
};

function zuAbweichung(z: {
  a: typeof abweichung.$inferSelect;
  bezugKennzeichen: string | null;
}): AbweichungMitBezug {
  return { ...z.a, bezugKennzeichen: z.bezugKennzeichen };
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
    opts: { status?: string; kundeId?: string; limit: number; offset: number },
  ): Promise<{ eintraege: AbweichungMitBezug[]; gesamt: number }> {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
    const filter = and(
      eq(abweichung.mandantId, mandant),
      opts.status ? eq(abweichung.status, opts.status) : undefined,
      // Kundensicht (F-41): nur Abweichungen zu Mieten dieses Kunden.
      opts.kundeId
        ? sql`${abweichung.bezugTyp} = 'miete' and exists (select 1 from miete m where m.id = ${abweichung.bezugId} and m.kunde_id = ${opts.kundeId})`
        : undefined,
    );
    const [zeilen, [zaehler]] = await Promise.all([
      this.mitBezug()
        .where(filter)
        .orderBy(desc(abweichung.erfasstAm))
        .limit(opts.limit)
        .offset(opts.offset),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(abweichung)
        .where(filter),
    ]);
    return { eintraege: zeilen.map(zuAbweichung), gesamt: zaehler?.n ?? 0 };
  }

  async hole(id: string): Promise<AbweichungMitBezug> {
    const [row] = await this.mitBezug().where(eq(abweichung.id, id));
    if (!row) {
      throw new NotFoundException('Abweichung nicht gefunden');
    }
    return zuAbweichung(row);
  }

  /**
   * Abweichung mit dem Kennzeichen des betroffenen Fahrzeugs – je nach Bezug
   * direkt, über die Miete oder über den Alarm (Joins statt Einzelabfragen).
   */
  private mitBezug() {
    const bezugMiete = alias(miete, 'bezug_miete');
    const bezugAlarm = alias(alarm, 'bezug_alarm');
    return this.db
      .select({ a: abweichung, bezugKennzeichen: fahrzeug.kennzeichen })
      .from(abweichung)
      .leftJoin(
        bezugMiete,
        and(eq(abweichung.bezugTyp, 'miete'), eq(bezugMiete.id, abweichung.bezugId)),
      )
      .leftJoin(
        bezugAlarm,
        and(eq(abweichung.bezugTyp, 'alarm'), eq(bezugAlarm.id, abweichung.bezugId)),
      )
      .leftJoin(
        fahrzeug,
        eq(
          fahrzeug.id,
          sql`coalesce(case when ${abweichung.bezugTyp} = 'fahrzeug' then ${abweichung.bezugId} end, ${bezugMiete.fahrzeugId}, ${bezugAlarm.fahrzeugId})`,
        ),
      )
      .$dynamic();
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
