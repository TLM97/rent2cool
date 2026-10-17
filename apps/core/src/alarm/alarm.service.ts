import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  findeAlarmKandidaten,
  istAlarmStatus,
  istAlarmUebergangErlaubt,
  type AlarmStatus,
  type Principal,
  type TelemetrieNachricht,
  type Temperaturprofil,
} from '@rent2cool/shared';
import { wechsleStatus, type StatusErgebnis } from '../audit/statuswechsel';
import type { Database } from '../db/client';
import { DB } from '../db/db.module';
import { alarm } from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';

@Injectable()
export class AlarmService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Wertet eine Telematik-Nachricht gegen das Profil aus und legt Alarme an.
   * Idempotent: dieselbe Nachricht erzeugt denselben Alarm nicht doppelt.
   */
  async auswerteNachricht(
    nachricht: TelemetrieNachricht,
    profil: Temperaturprofil,
    ctx: { mandantId: string; mieteId?: string | null },
  ): Promise<number> {
    const kandidaten = findeAlarmKandidaten(nachricht.messwerte, profil);
    if (kandidaten.length === 0) {
      return 0;
    }
    const res = await this.db
      .insert(alarm)
      .values(
        kandidaten.map((k) => ({
          mandantId: ctx.mandantId,
          fahrzeugId: nachricht.fahrzeugId,
          mieteId: ctx.mieteId ?? null,
          typ: k.typ,
          messgroesse: k.messgroesse ?? null,
          wert: k.wert ?? null,
          schwelle: k.schwelle ?? null,
          ausgeloestAm: new Date(nachricht.gesendetAm),
          nachrichtId: nachricht.nachrichtId,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: alarm.id });
    return res.length;
  }

  async liste(
    mandantId: string,
    opts: { status?: string; fahrzeugId?: string; mieteId?: string; limit: number; offset: number },
  ): Promise<{ eintraege: (typeof alarm.$inferSelect)[]; gesamt: number }> {
    const filter = and(
      eq(alarm.mandantId, mandantId),
      opts.status ? eq(alarm.status, opts.status) : undefined,
      opts.fahrzeugId ? eq(alarm.fahrzeugId, opts.fahrzeugId) : undefined,
      opts.mieteId ? eq(alarm.mieteId, opts.mieteId) : undefined,
    );
    const [eintraege, [zaehler]] = await Promise.all([
      this.db.select().from(alarm).where(filter).orderBy(desc(alarm.ausgeloestAm)).limit(opts.limit).offset(opts.offset),
      this.db.select({ n: sql<number>`count(*)::int` }).from(alarm).where(filter),
    ]);
    return { eintraege, gesamt: zaehler?.n ?? 0 };
  }

  async hole(id: string): Promise<typeof alarm.$inferSelect> {
    const [row] = await this.db.select().from(alarm).where(eq(alarm.id, id));
    if (!row) {
      throw new NotFoundException('Alarm nicht gefunden');
    }
    return row;
  }

  private setze(
    principal: Principal,
    id: string,
    nach: AlarmStatus,
    extra: Partial<typeof alarm.$inferInsert>,
  ): Promise<StatusErgebnis<AlarmStatus>> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    return wechsleStatus(this.db, principal, {
      entitaetTyp: nach === 'quittiert' ? 'alarm_quittieren' : 'alarm_schliessen',
      id,
      nach,
      nichtGefunden: 'Alarm nicht gefunden',
      lade: async (tx) =>
        (
          await tx
            .select({ status: alarm.status, quittiertVon: alarm.quittiertVon, quittiertAm: alarm.quittiertAm })
            .from(alarm)
            .where(and(eq(alarm.id, id), eq(alarm.mandantId, mandant)))
            .for('update')
        )[0],
      istStatus: istAlarmStatus,
      erlaubt: istAlarmUebergangErlaubt,
      // Erneutes Quittieren überschreibt nicht, wer zuerst quittiert hat.
      zusatz: (a) => (a.status === nach ? {} : extra),
      speichere: async (tx, werte) => {
        await tx.update(alarm).set(werte).where(eq(alarm.id, id));
      },
    });
  }

  quittiere(principal: Principal, id: string): Promise<StatusErgebnis<AlarmStatus>> {
    return this.setze(principal, id, 'quittiert', { quittiertVon: principal.akteurId, quittiertAm: new Date() });
  }

  schliesse(principal: Principal, id: string): Promise<StatusErgebnis<AlarmStatus>> {
    return this.setze(principal, id, 'geschlossen', {});
  }
}
