/**
 * Fahrzeugakte: Fahrzeug, Aggregat (Kühlaufbau), Sensor, Kalibrierung.
 * Arbeitsgrundlage nach T-002 / D-006..D-012. GDP-relevant.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { mandant, standort } from './stammdaten';

export const fahrzeug = pgTable(
  'fahrzeug',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    standortId: uuid('standort_id').references(() => standort.id),
    region: text('region'),
    kennzeichen: text('kennzeichen').notNull(),
    vin: text('vin'),
    fahrzeugprofil: text('fahrzeugprofil')
      .notNull()
      .default('PLACEHOLDER_Mercedes_Kuehltransporter_bis_3_5t'),
    zulGesamtmasseKg: integer('zul_gesamtmasse_kg').notNull(),
    benoetigteFuehrerscheinklasse: text('benoetigte_fuehrerscheinklasse').notNull().default('B'),
    hatFahrtenschreiber: boolean('hat_fahrtenschreiber').notNull().default(false),
    standardTemperaturprofil: text('standard_temperaturprofil'),
    status: text('status').notNull().default('angelegt'),
    erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
    aktualisiertAm: timestamp('aktualisiert_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_fahrzeug_kennzeichen').on(t.mandantId, t.kennzeichen),
    index('idx_fahrzeug_mandant_status').on(t.mandantId, t.status),
    index('idx_fahrzeug_standort').on(t.standortId),
    index('idx_fahrzeug_tacho').on(t.hatFahrtenschreiber),
  ],
);

export const aggregat = pgTable(
  'aggregat',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fahrzeugId: uuid('fahrzeug_id')
      .notNull()
      .references(() => fahrzeug.id),
    typ: text('typ'),
    hersteller: text('hersteller'),
    seriennummer: text('seriennummer'),
    temperaturQuelle: text('temperatur_quelle'),
    eingebautAm: timestamp('eingebaut_am', { withTimezone: true }),
    ausgebautAm: timestamp('ausgebaut_am', { withTimezone: true }),
    erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_aggregat_fahrzeug').on(t.fahrzeugId)],
);

export const sensor = pgTable(
  'sensor',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aggregatId: uuid('aggregat_id')
      .notNull()
      .references(() => aggregat.id),
    messgroesse: text('messgroesse').notNull(),
    einheit: text('einheit').notNull(),
    modell: text('modell'),
    seriennummer: text('seriennummer'),
    aktiv: boolean('aktiv').notNull().default(true),
    eingebautAm: timestamp('eingebaut_am', { withTimezone: true }).notNull().defaultNow(),
    ausgebautAm: timestamp('ausgebaut_am', { withTimezone: true }),
    ausbauGrund: text('ausbau_grund'),
    /** Ersetzter Sensor (Tausch-Kette); höchstens ein Nachfolger je Sensor. */
    vorgaengerId: uuid('vorgaenger_id').references((): AnyPgColumn => sensor.id),
    erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_sensor_aggregat').on(t.aggregatId),
    uniqueIndex('uq_sensor_vorgaenger').on(t.vorgaengerId).where(sql`vorgaenger_id IS NOT NULL`),
    index('idx_sensor_seriennummer_aktiv').on(t.seriennummer).where(sql`aktiv`),
  ],
);

export const kalibrierung = pgTable(
  'kalibrierung',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sensorId: uuid('sensor_id')
      .notNull()
      .references(() => sensor.id),
    durchgefuehrtAm: timestamp('durchgefuehrt_am', { withTimezone: true }).notNull(),
    gueltigBis: timestamp('gueltig_bis', { withTimezone: true }).notNull(),
    pruefstelle: text('pruefstelle'),
    zertifikatRef: text('zertifikat_ref'),
    ergebnis: text('ergebnis'),
    erfasstVon: text('erfasst_von'),
    erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_kalibrierung_sensor').on(t.sensorId, t.gueltigBis.desc())],
);
