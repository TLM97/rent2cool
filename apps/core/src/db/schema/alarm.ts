/** Alarm (aus Telematik-Auswertung) und GDP-Abweichung (CAPA). T-002 §4.13/§4.14. */
import {
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { mandant } from './stammdaten';
import { fahrzeug } from './fahrzeugakte';
import { miete } from './miete';

export const alarm = pgTable(
  'alarm',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    fahrzeugId: uuid('fahrzeug_id')
      .notNull()
      .references(() => fahrzeug.id),
    mieteId: uuid('miete_id').references(() => miete.id),
    sensorId: uuid('sensor_id'),
    typ: text('typ').notNull(),
    messgroesse: text('messgroesse'),
    wert: doublePrecision('wert'),
    schwelle: doublePrecision('schwelle'),
    ausgeloestAm: timestamp('ausgeloest_am', { withTimezone: true }).notNull(),
    nachrichtId: text('nachricht_id'),
    status: text('status').notNull().default('offen'),
    quittiertVon: text('quittiert_von'),
    quittiertAm: timestamp('quittiert_am', { withTimezone: true }),
    erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_alarm_nachricht_typ').on(t.fahrzeugId, t.nachrichtId, t.typ),
    index('idx_alarm_mandant_status').on(t.mandantId, t.status),
    index('idx_alarm_miete').on(t.mieteId),
    index('idx_alarm_fahrzeug_zeit').on(t.fahrzeugId, t.ausgeloestAm.desc()),
  ],
);

export const abweichung = pgTable(
  'abweichung',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    bezugTyp: text('bezug_typ').notNull(),
    bezugId: uuid('bezug_id').notNull(),
    beschreibung: text('beschreibung').notNull(),
    schweregrad: text('schweregrad'),
    status: text('status').notNull().default('erfasst'),
    bewertung: text('bewertung'),
    massnahmen: text('massnahmen'),
    verantwortlich: text('verantwortlich'),
    erfasstAm: timestamp('erfasst_am', { withTimezone: true }).notNull().defaultNow(),
    geschlossenAm: timestamp('geschlossen_am', { withTimezone: true }),
    aktualisiertAm: timestamp('aktualisiert_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_abweichung_bezug').on(t.bezugTyp, t.bezugId),
    index('idx_abweichung_mandant_status').on(t.mandantId, t.status),
  ],
);
