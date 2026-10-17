/** Rechnung (R-63) und fortlaufende Nummernsequenz. Beträge in ganzen Cent. */
import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { mandant } from './stammdaten';
import { kunde } from './kunde';
import { miete } from './miete';

export const rechnung = pgTable(
  'rechnung',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    kundeId: uuid('kunde_id')
      .notNull()
      .references(() => kunde.id),
    mieteId: uuid('miete_id')
      .notNull()
      .references(() => miete.id),
    rechnungsnummer: text('rechnungsnummer').notNull(),
    zeitraumVon: timestamp('zeitraum_von', { withTimezone: true }).notNull(),
    zeitraumBis: timestamp('zeitraum_bis', { withTimezone: true }).notNull(),
    nettoCent: integer('netto_cent').notNull(),
    steuerSatz: integer('steuer_satz').notNull(),
    steuerCent: integer('steuer_cent').notNull(),
    bruttoCent: integer('brutto_cent').notNull(),
    waehrung: text('waehrung').notNull().default('EUR'),
    status: text('status').notNull().default('entwurf'),
    gestelltAm: timestamp('gestellt_am', { withTimezone: true }),
    bezahltAm: timestamp('bezahlt_am', { withTimezone: true }),
    erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
    aktualisiertAm: timestamp('aktualisiert_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_rechnung_nummer').on(t.mandantId, t.rechnungsnummer),
    uniqueIndex('uq_rechnung_miete').on(t.mieteId),
    index('idx_rechnung_kunde').on(t.kundeId),
    index('idx_rechnung_mandant_status').on(t.mandantId, t.status),
  ],
);

export const rechnungSequenz = pgTable(
  'rechnung_sequenz',
  {
    mandantId: uuid('mandant_id').notNull(),
    jahr: integer('jahr').notNull(),
    letzteNummer: integer('letzte_nummer').notNull(),
  },
  (t) => [primaryKey({ columns: [t.mandantId, t.jahr] })],
);
