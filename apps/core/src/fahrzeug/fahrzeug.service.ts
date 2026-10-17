import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, max, sql } from 'drizzle-orm';
import {
  istFahrzeugStatus,
  istUebergangErlaubt,
  type FahrzeugStatus,
  type Principal,
} from '@rent2cool/shared';
import {
  ermittleAenderungen,
  neueWerte,
  pruefeVersion,
  versionVon,
  type StammdatenErgebnis,
} from '../audit/aenderung';
import { protokolliereAnlage, schreibeAudit } from '../audit/audit.service';
import { wechsleStatus, type StatusErgebnis } from '../audit/statuswechsel';
import type { Database } from '../db/client';
import { DB } from '../db/db.module';
import { aggregat, fahrzeug, kalibrierung, sensor, standort } from '../db/schema';
import { istPgFehler, PG_FEHLER } from '../db/fehler';
import { enthaeltMuster } from '../db/suche';
import { standortNutzbar } from '../standort/standort.service';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';
import { bewerteBuchbarkeit, type BuchbarkeitErgebnis, type SensorFrist } from './fristen';
import type { FahrzeugAendern, FahrzeugErstellen, KalibrierungEingabe, SensorTausch } from './dto';

export interface VerfuegbaresFahrzeug {
  id: string;
  kennzeichen: string;
  benoetigteFuehrerscheinklasse: string;
  hatFahrtenschreiber: boolean;
  standardTemperaturprofil: string | null;
  zulGesamtmasseKg: number;
  /** Frühestes Ablaufdatum der Kalibrierungen aller aktiven Sensoren. */
  kalibriertBis: string;
}

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

  /** Fahrzeugakte anlegen (Fahrzeug, Kühlaufbau, Sensoren) – ein Audit-Eintrag mit der ganzen Akte. */
  async erstelle(principal: Principal, p: FahrzeugErstellen): Promise<{ id: string }> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    return this.db.transaction(async (tx) => {
      if (p.standortId) {
        const grund = await standortNutzbar(tx, mandant, p.standortId, 'Heimatstandort');
        if (grund) throw new BadRequestException(grund);
      }
      let fz: typeof fahrzeug.$inferSelect | undefined;
      try {
        [fz] = await tx
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
          .returning();
      } catch (e: unknown) {
        if (istPgFehler(e, PG_FEHLER.EINDEUTIG, 'uq_fahrzeug_kennzeichen')) {
          throw new ConflictException(
            `Kennzeichen "${p.kennzeichen}" existiert bereits für diesen Mandanten`,
          );
        }
        throw e;
      }
      if (!fz) {
        throw new Error('Fahrzeug wurde nicht angelegt');
      }

      let aufbau:
        (typeof aggregat.$inferSelect & { sensoren: (typeof sensor.$inferSelect)[] }) | null = null;
      if (p.aggregat) {
        const [ag] = await tx
          .insert(aggregat)
          .values({
            fahrzeugId: fz.id,
            typ: p.aggregat.typ ?? null,
            hersteller: p.aggregat.hersteller ?? null,
            seriennummer: p.aggregat.seriennummer ?? null,
            temperaturQuelle: p.aggregat.temperaturQuelle ?? null,
          })
          .returning();
        const sensoren =
          p.aggregat.sensoren.length > 0
            ? await tx
                .insert(sensor)
                .values(
                  p.aggregat.sensoren.map((s) => ({
                    aggregatId: ag!.id,
                    messgroesse: s.messgroesse,
                    einheit: s.einheit,
                    modell: s.modell ?? null,
                    seriennummer: s.seriennummer ?? null,
                  })),
                )
                .returning()
            : [];
        aufbau = { ...ag!, sensoren };
      }
      await protokolliereAnlage(tx, principal, 'fahrzeug', fz.id, { ...fz, aggregat: aufbau });
      return { id: fz.id };
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
      if (eingabe.standortId && eingabe.standortId !== vorher.standortId) {
        const grund = await standortNutzbar(tx, mandant, eingabe.standortId, 'Heimatstandort');
        if (grund) throw new BadRequestException(grund);
      }
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
        if (istPgFehler(e, PG_FEHLER.EINDEUTIG, 'uq_fahrzeug_kennzeichen')) {
          throw new ConflictException(
            `Kennzeichen "${p.kennzeichen}" existiert bereits für diesen Mandanten`,
          );
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
  ): Promise<{
    eintraege: (typeof fahrzeug.$inferSelect & { standortName: string | null })[];
    gesamt: number;
  }> {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
    const filter = and(
      eq(fahrzeug.mandantId, mandant),
      opts.status ? eq(fahrzeug.status, opts.status) : undefined,
      opts.standortId ? eq(fahrzeug.standortId, opts.standortId) : undefined,
    );
    const [zeilen, [zaehler]] = await Promise.all([
      this.db
        .select({ f: fahrzeug, standortName: standort.name })
        .from(fahrzeug)
        .leftJoin(standort, eq(fahrzeug.standortId, standort.id))
        .where(filter)
        .orderBy(desc(fahrzeug.erstelltAm))
        .limit(opts.limit)
        .offset(opts.offset),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(fahrzeug)
        .where(filter),
    ]);
    return {
      eintraege: zeilen.map((z) => ({ ...z.f, standortName: z.standortName })),
      gesamt: zaehler?.n ?? 0,
    };
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
  async tauscheSensor(
    principal: Principal,
    sensorId: string,
    p: SensorTausch,
  ): Promise<SensorTauschErgebnis> {
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
        const [nachfolger] = await tx
          .select()
          .from(sensor)
          .where(eq(sensor.vorgaengerId, sensorId));
        if (nachfolger && nachfolger.seriennummer === p.seriennummer) {
          return {
            alterSensorId: sensorId,
            neuerSensorId: nachfolger.id,
            fahrzeugId: alt.fahrzeugId,
            idempotent: true,
          };
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
        .where(
          and(
            eq(sensor.seriennummer, p.seriennummer),
            eq(sensor.aktiv, true),
            eq(fahrzeug.mandantId, mandant),
          ),
        )
        .limit(1);
      if (doppelt) {
        throw new ConflictException(
          `Sensor SN ${p.seriennummer} ist bereits in ${doppelt.kennzeichen} eingebaut.`,
        );
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
      return {
        alterSensorId: sensorId,
        neuerSensorId: neu!.id,
        fahrzeugId: alt.fahrzeugId,
        kalibrierungId,
        idempotent: false,
      };
    });
  }

  async aendereStatus(
    principal: Principal,
    id: string,
    nach: FahrzeugStatus,
  ): Promise<StatusErgebnis<FahrzeugStatus>> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    return wechsleStatus(this.db, principal, {
      entitaetTyp: 'fahrzeug_status',
      id,
      nach,
      nichtGefunden: 'Fahrzeug nicht gefunden',
      lade: async (tx) =>
        (
          await tx
            .select({ status: fahrzeug.status })
            .from(fahrzeug)
            .where(and(eq(fahrzeug.id, id), eq(fahrzeug.mandantId, mandant)))
            .for('update')
        )[0],
      istStatus: istFahrzeugStatus,
      erlaubt: istUebergangErlaubt,
      speichere: async (tx, werte) => {
        await tx
          .update(fahrzeug)
          .set({ ...werte, aktualisiertAm: new Date() })
          .where(eq(fahrzeug.id, id));
      },
    });
  }

  /**
   * Kalibrierung erfassen. Audit unter der Sensor-ID, damit der Verlauf der
   * Fahrzeugakte Kalibrierungen und Tausch eines Sensors zusammen zeigt.
   */
  async fuegeKalibrierungHinzu(
    principal: Principal,
    sensorId: string,
    k: KalibrierungEingabe,
  ): Promise<{ id: string }> {
    const mandant = principal.mandantId ?? PLACEHOLDER_MANDANT_ID;
    return this.db.transaction(async (tx) => {
      const [s] = await tx
        .select({ id: sensor.id })
        .from(sensor)
        .innerJoin(aggregat, eq(sensor.aggregatId, aggregat.id))
        .innerJoin(fahrzeug, eq(aggregat.fahrzeugId, fahrzeug.id))
        .where(and(eq(sensor.id, sensorId), eq(fahrzeug.mandantId, mandant)));
      if (!s) {
        throw new NotFoundException('Sensor nicht gefunden');
      }
      const [row] = await tx
        .insert(kalibrierung)
        .values(kalibrierungsWerte(sensorId, principal.akteurId, k))
        .returning();
      await protokolliereAnlage(tx, principal, 'kalibrierung', sensorId, row);
      return { id: row!.id };
    });
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
  /**
   * Buchbare Fahrzeuge für einen Zeitraum – dieselben Regeln wie die Buchung
   * (MieteService.pruefeBuchung): Status „verfügbar“, jeder aktive Sensor zum
   * Mietbeginn gültig kalibriert, optional Fahrtenschreiber (Ausland, D-006)
   * und eine vom Fahrer abgedeckte Klasse (R-22), keine Überschneidung mit
   * bestätigten/aktiven Mieten (nutzt den GiST-Index aus Migration 0010).
   * Eine Abfrage mit Seitenweise-Ergebnis – trägt auch bei 4.000 Fahrzeugen (D-003).
   */
  async sucheVerfuegbare(
    mandantId: string | undefined,
    o: {
      von: Date;
      bis: Date;
      suche?: string;
      klassen?: readonly string[];
      fahrtenschreiber?: boolean;
      /** Heimatstandort = Abholstandort (D-011). */
      standortId?: string;
      limit: number;
      offset: number;
    },
  ): Promise<{ eintraege: VerfuegbaresFahrzeug[]; gesamt: number }> {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
    const muster = enthaeltMuster(o.suche);
    const von = o.von.toISOString();
    const bis = o.bis.toISOString();
    const zeilen = (await this.db.execute(sql`
      with sensor_frist as (
        select a.fahrzeug_id, s.id as sensor_id, max(k.gueltig_bis) as bis
        from sensor s
        join aggregat a on a.id = s.aggregat_id
        join fahrzeug f0 on f0.id = a.fahrzeug_id and f0.mandant_id = ${mandant} and f0.status = 'verfuegbar'
        left join kalibrierung k on k.sensor_id = s.id
        where s.aktiv
        group by a.fahrzeug_id, s.id
      ), fahrzeug_frist as (
        select fahrzeug_id, min(bis) as kalibriert_bis, bool_and(bis is not null) as vollstaendig
        from sensor_frist
        group by fahrzeug_id
      )
      select f.id, f.kennzeichen, f.benoetigte_fuehrerscheinklasse, f.hat_fahrtenschreiber,
             f.standard_temperaturprofil, f.zul_gesamtmasse_kg, ff.kalibriert_bis,
             count(*) over () as gesamt
      from fahrzeug f
      join fahrzeug_frist ff on ff.fahrzeug_id = f.id
      where f.mandant_id = ${mandant}
        and f.status = 'verfuegbar'
        and ff.vollstaendig
        and ff.kalibriert_bis >= ${von}::timestamptz
        ${muster ? sql`and f.kennzeichen ilike ${muster}` : sql``}
        ${o.klassen && o.klassen.length > 0 ? sql`and f.benoetigte_fuehrerscheinklasse in ${o.klassen}` : sql``}
        ${o.fahrtenschreiber ? sql`and f.hat_fahrtenschreiber` : sql``}
        ${o.standortId ? sql`and f.standort_id = ${o.standortId}` : sql``}
        and not exists (
          select 1 from miete m
          where m.fahrzeug_id = f.id
            and m.status in ('bestaetigt', 'aktiv')
            and tstzrange(m.start_geplant, m.ende_geplant, '[)') && tstzrange(${von}::timestamptz, ${bis}::timestamptz, '[)')
        )
      order by f.kennzeichen
      limit ${o.limit} offset ${o.offset}
    `)) as unknown as Record<string, unknown>[];
    return {
      eintraege: zeilen.map((z) => ({
        id: String(z.id),
        kennzeichen: String(z.kennzeichen),
        benoetigteFuehrerscheinklasse: String(z.benoetigte_fuehrerscheinklasse),
        hatFahrtenschreiber: Boolean(z.hat_fahrtenschreiber),
        standardTemperaturprofil: (z.standard_temperaturprofil as string | null) ?? null,
        zulGesamtmasseKg: Number(z.zul_gesamtmasse_kg),
        kalibriertBis: new Date(z.kalibriert_bis as string | Date).toISOString(),
      })),
      gesamt: zeilen.length > 0 ? Number(zeilen[0]!.gesamt) : 0,
    };
  }

  /**
   * Sensoren, deren jüngste Kalibrierung vor `bis` abläuft oder fehlt. Die
   * Datenbank filtert (HAVING) – bei 4.000 Fahrzeugen nie alle Sensoren laden (D-003).
   */
  async faelligeKalibrierungen(
    mandantId: string | undefined,
    bis: Date,
  ): Promise<
    {
      fahrzeugId: string;
      kennzeichen: string;
      sensorId: string;
      seriennummer: string | null;
      gueltigBis: string | null;
    }[]
  > {
    const mandant = mandantId ?? PLACEHOLDER_MANDANT_ID;
    const juengste = sql<Date | null>`max(${kalibrierung.gueltigBis})`;
    const rows = await this.db
      .select({
        fahrzeugId: fahrzeug.id,
        kennzeichen: fahrzeug.kennzeichen,
        sensorId: sensor.id,
        seriennummer: sensor.seriennummer,
        gueltigBis: juengste,
      })
      .from(sensor)
      .innerJoin(aggregat, eq(sensor.aggregatId, aggregat.id))
      .innerJoin(fahrzeug, eq(aggregat.fahrzeugId, fahrzeug.id))
      .leftJoin(kalibrierung, eq(kalibrierung.sensorId, sensor.id))
      .where(and(eq(fahrzeug.mandantId, mandant), eq(sensor.aktiv, true)))
      .groupBy(fahrzeug.id, fahrzeug.kennzeichen, sensor.id, sensor.seriennummer)
      .having(sql`${juengste} is null or ${juengste} < ${bis.toISOString()}`)
      .orderBy(sql`${juengste} asc nulls first`);

    return rows.map((r) => ({
      ...r,
      gueltigBis: r.gueltigBis ? new Date(r.gueltigBis).toISOString() : null,
    }));
  }
}
