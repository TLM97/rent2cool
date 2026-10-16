import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  findeAlarmKandidaten,
  istAlarmUebergangErlaubt,
  type AlarmStatus,
  type TelemetrieNachricht,
  type Temperaturprofil,
} from '@rent2cool/shared';
import type { Database } from '../db/client';
import { DB } from '../db/db.module';
import { alarm } from '../db/schema';

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

  private async setze(id: string, nach: AlarmStatus, extra: Partial<typeof alarm.$inferInsert>) {
    const a = await this.hole(id);
    const von = a.status as AlarmStatus;
    if (von !== nach && !istAlarmUebergangErlaubt(von, nach)) {
      throw new BadRequestException(`Statusübergang "${von}" -> "${nach}" ist nicht erlaubt`);
    }
    await this.db.update(alarm).set({ status: nach, ...extra }).where(eq(alarm.id, id));
    return { id, status: nach };
  }

  quittiere(id: string, von: string): Promise<{ id: string; status: AlarmStatus }> {
    return this.setze(id, 'quittiert', { quittiertVon: von, quittiertAm: new Date() });
  }

  schliesse(id: string): Promise<{ id: string; status: AlarmStatus }> {
    return this.setze(id, 'geschlossen', {});
  }
}
