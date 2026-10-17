/**
 * Stammdaten-Basis: Mandant (Betreiber, D-003) und Standort (D-011).
 * Arbeitsgrundlage nach T-002; finale Freigabe durch die Planung offen.
 */
import type { Oeffnungsregeln } from '@rent2cool/shared';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const mandant = pgTable('mandant', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  aktiv: boolean('aktiv').notNull().default(true),
  erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
});

export const standort = pgTable(
  'standort',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    name: text('name').notNull(),
    strasse: text('strasse'),
    plz: text('plz'),
    ort: text('ort'),
    land: text('land').notNull().default('DE'),
    geofenceLat: doublePrecision('geofence_lat'),
    geofenceLng: doublePrecision('geofence_lng'),
    geofenceRadiusM: integer('geofence_radius_m'),
    region: text('region'),
    /** Wochenplan in Ortszeit (Oeffnungsregeln aus @rent2cool/shared); null = rund um die Uhr. */
    oeffnungsregeln: jsonb('oeffnungsregeln').$type<Oeffnungsregeln | null>(),
    aktiv: boolean('aktiv').notNull().default(true),
    erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
    aktualisiertAm: timestamp('aktualisiert_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_standort_mandant').on(t.mandantId),
    uniqueIndex('uq_standort_mandant_name').on(t.mandantId, t.name),
  ],
);
