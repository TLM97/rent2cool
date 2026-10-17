import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, max, sql } from 'drizzle-orm';
import { istUebergangErlaubt, type FahrzeugStatus, type Principal } from '@rent2cool/shared';
import { ermittleAenderungen, neueWerte, pruefeVersion, versionVon, type StammdatenErgebnis } from '../audit/aenderung';
import { schreibeAudit } from '../audit/audit.service';
import type { Database } from '../db/client';
import { DB } from '../db/db.module';
import { aggregat, fahrzeug, kalibrierung, sensor } from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';
import { bewerteBuchbarkeit, type BuchbarkeitErgebnis, type SensorFrist } from './fristen';
import type { FahrzeugAendern, FahrzeugErstellen, KalibrierungEingabe, SensorTausch } from './dto';

export type AkteSensor = typeof sensor.$inferSelect & { kalibriertBis: Date | null };

export interface SensorTauschErgebnis {
  alterSensorId: string;
  neuerSensorId: string;
  fahrzeugId: string;
  kalibrierungId?: string;
  /** true: Wiederholung einer bereits ausgeführten Anfrage, nichts Neues angelegt. */
  idempotent: boolean;
}

function kalibrierungsWerte(sensorId: string, erfasstVon: string, k: KalibrierungEingabe) {
  return {
    sensorId,
    durchgefuehrtAm: new Date(k.durchgefuehrtAm),
    gueltigBis: new Date(k.gueltigBis),
    pruefstelle: k.pruefstelle ?? null,
    zertifikatRef: k.zertifikatRef ?? null,
    ergebnis: k.ergebnis ?? null,
    erfasstVon,
  };
}

@Injectable()
export class FahrzeugService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async erstelle(mandantId: string | undefined, p: FahrzeugErstellen): Promise<{ id: string }> {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
    return this.db.transaction(async (tx) => {
      let fahrzeugId: string;
      try {
        const [fz] = await tx
          .insert(fahrzeug)
          .values({
            mandantId: mandant,
            standortId: p.standortId ?? null,
            region: p.region ?? null,
            kennzeichen: p.kennzeichen,
            vin: p.vin ?? null,
            ...(p.fahrzeugprofil ? { fahrzeugprofil: p.fahrzeugprofil } : {}),
            zulGesamtmasseKg: p.zulGesamtmasseKg,
            benoetigteFuehrerscheinklasse: p.benoetigteFuehrerscheinklasse,
            hatFahrtenschreiber: p.hatFahrtenschreiber,
            standardTemperaturprofil: p.standardTemperaturprofil ?? null,
            status: 'angelegt',
          })
          .returning({ id: fahrzeug.id });
        fahrzeugId = fz!.id;
      } catch (e: unknown) {
        const msg = String(e);
        if (msg.includes('23505') || msg.toLowerCase().includes('unique')) {
          throw new ConflictException(`Kennzeichen "${p.kennzeichen}" existiert bereits für diesen Mandanten`);
        }
        throw e;
      }

      if (p.aggregat) {
        const [ag] = await tx
          .insert(aggregat)
          .values({
            fahrzeugId,
            typ: p.aggregat.typ ?? null,
            hersteller: p.aggregat.hersteller ?? null,
            seriennummer: p.aggregat.seriennummer ?? null,
            temperaturQuelle: p.aggregat.temperaturQuelle ?? null,
          })
          .returning({ id: aggregat.id });
        if (p.aggregat.sensoren.length > 0) {
          await tx.insert(sensor).values(
            p.aggregat.sensoren.map((s) => ({
              aggregatId: ag!.id,
              messgroesse: s.messgroesse,
              einheit: s.einheit,
              modell: s.modell ?? null,
              seriennummer: s.seriennummer ?? null,
            })),
          );
        }
      }
      return { id: fahrzeugId };
    });
  }

  /**
   * Stammdaten ändern: nur geänderte Felder, mit Versionsprüfung und
   * Audit-Eintrag (alt/neu) in derselben Transaktion.
   */
  async aendere(principal: Principal, id: string, p: FahrzeugAendern): Promise<StammdatenErgebnis> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    const { version, ...eingabe } = p;
    return this.db.transaction(async (tx) => {
      const [vorher] = await tx
        .select()
        .from(fahrzeug)
        .where(and(eq(fahrzeug.id, id), eq(fahrzeug.mandantId, mandant)))
        .for('update');
      if (!vorher) {
        throw new NotFoundException('Fahrzeug nicht gefunden');
      }
      pruefeVersion(vorher.aktualisiertAm, version);
      const a = ermittleAenderungen(vorher, eingabe);
      if (a.felder.length === 0) {
        return { id, version: versionVon(vorher.aktualisiertAm), geaendert: [] };
      }
      const jetzt = new Date();
      try {
        await tx
          .update(fahrzeug)
          .set({ ...neueWerte(eingabe, a), aktualisiertAm: jetzt })
          .where(eq(fahrzeug.id, id));
      } catch (e: unknown) {
        const msg = String(e);
        if (msg.includes('23505') || msg.toLowerCase().includes('unique')) {
          throw new ConflictException(`Kennzeichen "${p.kennzeichen}" existiert bereits für diesen Mandanten`);
        }
        throw e;
      }
      await schreibeAudit(tx, principal, {
        aktion: 'PATCH',
        entitaetTyp: 'fahrzeug',
        entitaetId: id,
        altWert: a.alt,
        neuWert: a.neu,
      });
      return { id, version: versionVon(jetzt), geaendert: a.felder };
    });
  }

  async liste(
    mandantId: string | undefined,
    opts: { status?: FahrzeugStatus; standortId?: string; limit: number; offset: number },
  ): Promise<{ eintraege: (typeof fahrzeug.$inferSelect)[]; gesamt: number }> {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
    const filter = and(
      eq(fahrzeug.mandantId, mandant),
      opts.status ? eq(fahrzeug.status, opts.status) : undefined,
      opts.standortId ? eq(fahrzeug.standortId, opts.standortId) : undefined,
    );
    const [eintraege, [zaehler]] = await Promise.all([
      this.db
        .select()
        .from(fahrzeug)
        .where(filter)
        .orderBy(desc(fahrzeug.erstelltAm))
        .limit(opts.limit)
        .offset(opts.offset),
      this.db.select({ n: sql<number>`count(*)::int` }).from(fahrzeug).where(filter),
    ]);
    return { eintraege, gesamt: zaehler?.n ?? 0 };
  }

  async holeAkte(id: string): Promise<{
    fahrzeug: typeof fahrzeug.$inferSelect;
    aggregate: (typeof aggregat.$inferSelect & { sensoren: AkteSensor[] })[];
  }> {
    const [fz] = await this.db.select().from(fahrzeug).where(eq(fahrzeug.id, id));
    if (!fz) {
      throw new NotFoundException('Fahrzeug nicht gefunden');
    }
    const aggregate = await this.db.select().from(aggregat).where(eq(aggregat.fahrzeugId, id));
    const aggIds = aggregate.map((a) => a.id);
    const sensoren = aggIds.length
      ? await this.db
          .select()
          .from(sensor)
          .where(inArray(sensor.aggregatId, aggIds))
          .orderBy(desc(sensor.eingebautAm))
      : [];
    const bis = await this.kalibriertBis(sensoren.map((s) => s.id));
    return {
      fahrzeug: fz,
      aggregate: aggregate.map((a) => ({
        ...a,
        sensoren: sensoren
          .filter((s) => s.aggregatId === a.id)
          .map((s) => ({ ...s, kalibriertBis: bis.get(s.id) ?? null })),
      })),
    };
  }

  /** Jüngstes „gültig bis“ je Sensor – eine Abfrage statt einer je Sensor. */
  private async kalibriertBis(sensorIds: string[]): Promise<Map<string, Date>> {
    if (sensorIds.length === 0) return new Map();
    const rows = await this.db
      .select({ sensorId: kalibrierung.sensorId, bis: max(kalibrierung.gueltigBis) })
      .from(kalibrierung)
      .where(inArray(kalibrierung.sensorId, sensorIds))
      .groupBy(kalibrierung.sensorId);
    return new Map(rows.filter((r) => r.bis).map((r) => [r.sensorId, r.bis!]));
  }

  /**
   * Sensor tauschen (eine Transaktion): alten Sensor ausbauen, neuen mit
   * gleicher Messgröße einbauen, optional gleich kalibrieren, Audit mit altem
   * und neuem Sensor. Wiederholt die App dieselbe Anfrage (gleiche
   * Seriennummer), kommt das vorhandene Ergebnis zurück (D-003).
   */
  async tauscheSensor(principal: Principal, sensorId: string, p: SensorTausch): Promise<SensorTauschErgebnis> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    return this.db.transaction(async (tx) => {
      const [alt] = await tx
        .select({ s: sensor, fahrzeugId: fahrzeug.id, mandantId: fahrzeug.mandantId })
        .from(sensor)
        .innerJoin(aggregat, eq(sensor.aggregatId, aggregat.id))
        .innerJoin(fahrzeug, eq(aggregat.fahrzeugId, fahrzeug.id))
        .where(eq(sensor.id, sensorId))
        .for('update', { of: sensor });
      if (!alt || alt.mandantId !== mandant) {
        throw new NotFoundException('Sensor nicht gefunden');
      }

      if (!alt.s.aktiv) {
        const [nachfolger] = await tx.select().from(sensor).where(eq(sensor.vorgaengerId, sensorId));
        if (nachfolger && nachfolger.seriennummer === p.seriennummer) {
          return { alterSensorId: sensorId, neuerSensorId: nachfolger.id, fahrzeugId: alt.fahrzeugId, idempotent: true };
        }
        throw new ConflictException(
          nachfolger
            ? `Sensor wurde bereits ersetzt (neuer Sensor SN ${nachfolger.seriennummer ?? '–'}).`
            : 'Sensor ist bereits ausgebaut.',
        );
      }

      // Ein physischer Sensor kann nicht in zwei Fahrzeugen gleichzeitig stecken.
      const [doppelt] = await tx
        .select({ kennzeichen: fahrzeug.kennzeichen })
        .from(sensor)
        .innerJoin(aggregat, eq(sensor.aggregatId, aggregat.id))
        .innerJoin(fahrzeug, eq(aggregat.fahrzeugId, fahrzeug.id))
        .where(and(eq(sensor.seriennummer, p.seriennummer), eq(sensor.aktiv, true), eq(fahrzeug.mandantId, mandant)))
        .limit(1);
      if (doppelt) {
        throw new ConflictException(`Sensor SN ${p.seriennummer} ist bereits in ${doppelt.kennzeichen} eingebaut.`);
      }

      const jetzt = new Date();
      await tx
        .update(sensor)
        .set({ aktiv: false, ausgebautAm: jetzt, ausbauGrund: p.grund })
        .where(eq(sensor.id, sensorId));
      const [neu] = await tx
        .insert(sensor)
        .values({
          aggregatId: alt.s.aggregatId,
          messgroesse: alt.s.messgroesse,
          einheit: alt.s.einheit,
          modell: p.modell || alt.s.modell,
          seriennummer: p.seriennummer,
          eingebautAm: jetzt,
          vorgaengerId: sensorId,
        })
        .returning();
      let kalibrierungId: string | undefined;
      if (p.kalibrierung) {
        const [k] = await tx
          .insert(kalibrierung)
          .values(kalibrierungsWerte(neu!.id, principal.akteurId, p.kalibrierung))
          .returning({ id: kalibrierung.id });
        kalibrierungId = k!.id;
      }
      await schreibeAudit(tx, principal, {
        aktion: 'POST',
        entitaetTyp: 'sensor_tausch',
        entitaetId: sensorId,
        altWert: { sensorId, seriennummer: alt.s.seriennummer, modell: alt.s.modell, aktiv: true },
        neuWert: {
          sensorId: neu!.id,
          seriennummer: neu!.seriennummer,
          modell: neu!.modell,
          grund: p.grund,
          ausgebautAm: jetzt.toISOString(),
          kalibrierung: p.kalibrierung ? { id: kalibrierungId, ...p.kalibrierung } : null,
        },
      });
      return { alterSensorId: sensorId, neuerSensorId: neu!.id, fahrzeugId: alt.fahrzeugId, kalibrierungId, idempotent: false };
    });
  }

  async aendereStatus(id: string, nach: FahrzeugStatus): Promise<{ id: string; status: FahrzeugStatus }> {
    const [fz] = await this.db
      .select({ status: fahrzeug.status })
      .from(fahrzeug)
      .where(eq(fahrzeug.id, id));
    if (!fz) {
      throw new NotFoundException('Fahrzeug nicht gefunden');
    }
    const von = fz.status as FahrzeugStatus;
    if (von === nach) {
      return { id, status: nach };
    }
    if (!istUebergangErlaubt(von, nach)) {
      throw new BadRequestException(`Statusübergang "${von}" -> "${nach}" ist nicht erlaubt`);
    }
    await this.db
      .update(fahrzeug)
      .set({ status: nach, aktualisiertAm: new Date() })
      .where(eq(fahrzeug.id, id));
    return { id, status: nach };
  }

  async fuegeKalibrierungHinzu(
    sensorId: string,
    erfasstVon: string,
    k: KalibrierungEingabe,
  ): Promise<{ id: string }> {
    const [s] = await this.db.select({ id: sensor.id }).from(sensor).where(eq(sensor.id, sensorId));
    if (!s) {
      throw new NotFoundException('Sensor nicht gefunden');
    }
    const [row] = await this.db
      .insert(kalibrierung)
      .values(kalibrierungsWerte(sensorId, erfasstVon, k))
      .returning({ id: kalibrierung.id });
    return { id: row!.id };
  }

  async buchbarkeit(id: string, stichtag: Date): Promise<BuchbarkeitErgebnis> {
    const akte = await this.holeAkte(id);
    const fristen: SensorFrist[] = akte.aggregate
      .flatMap((a) => a.sensoren)
      .filter((s) => s.aktiv)
      .map((s) => ({ sensorId: s.id, gueltigBis: s.kalibriertBis }));
    return bewerteBuchbarkeit(akte.fahrzeug.status, fristen, stichtag);
  }

  /** Sensoren, deren jüngste Kalibrierung vor `bis` abläuft oder fehlt. */
  async faelligeKalibrierungen(
    mandantId: string | undefined,
    bis: Date,
  ): Promise<{ fahrzeugId: string; kennzeichen: string; sensorId: string; gueltigBis: string | null }[]> {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
    const rows = await this.db
      .select({
        fahrzeugId: fahrzeug.id,
        kennzeichen: fahrzeug.kennzeichen,
        sensorId: sensor.id,
        gueltigBis: sql<Date | null>`max(${kalibrierung.gueltigBis})`,
      })
      .from(sensor)
      .innerJoin(aggregat, eq(sensor.aggregatId, aggregat.id))
      .innerJoin(fahrzeug, eq(aggregat.fahrzeugId, fahrzeug.id))
      .leftJoin(kalibrierung, eq(kalibrierung.sensorId, sensor.id))
      .where(and(eq(fahrzeug.mandantId, mandant), eq(sensor.aktiv, true)))
      .groupBy(fahrzeug.id, fahrzeug.kennzeichen, sensor.id);

    return rows
      .filter((r) => r.gueltigBis === null || new Date(r.gueltigBis).getTime() < bis.getTime())
      .map((r) => ({
        fahrzeugId: r.fahrzeugId,
        kennzeichen: r.kennzeichen,
        sensorId: r.sensorId,
        gueltigBis: r.gueltigBis ? new Date(r.gueltigBis).toISOString() : null,
      }));
  }
}
