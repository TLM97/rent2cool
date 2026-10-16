/** Miete/Buchung (D-009). Arbeitsgrundlage nach T-002. */
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { mandant, standort } from './stammdaten';
import { fahrzeug } from './fahrzeugakte';
import { fahrer, kunde } from './kunde';

export const miete = pgTable(
  'miete',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    kundeId: uuid('kunde_id')
      .notNull()
      .references(() => kunde.id),
    fahrzeugId: uuid('fahrzeug_id')
      .notNull()
      .references(() => fahrzeug.id),
    fahrerId: uuid('fahrer_id').references(() => fahrer.id),
    standortAbholId: uuid('standort_abhol_id').references(() => standort.id),
    standortRueckgabeId: uuid('standort_rueckgabe_id').references(() => standort.id),
    region: text('region'),
    startGeplant: timestamp('start_geplant', { withTimezone: true }).notNull(),
    endeGeplant: timestamp('ende_geplant', { withTimezone: true }).notNull(),
    startIst: timestamp('start_ist', { withTimezone: true }),
    endeIst: timestamp('ende_ist', { withTimezone: true }),
    tarif: text('tarif'),
    auslandsfahrtGeplant: boolean('auslandsfahrt_geplant').notNull().default(false),
    temperaturprofil: text('temperaturprofil'),
    status: text('status').notNull().default('angefragt'),
    idempotencyKey: text('idempotency_key'),
    erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
    aktualisiertAm: timestamp('aktualisiert_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_miete_mandant_status').on(t.mandantId, t.status),
    index('idx_miete_kunde').on(t.kundeId),
    index('idx_miete_fahrzeug_zeit').on(t.fahrzeugId, t.startGeplant),
  ],
);
