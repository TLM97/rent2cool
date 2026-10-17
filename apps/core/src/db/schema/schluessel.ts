/** Digitaler Schlüssel und Befehlsprotokoll (D-014, D-015, Migration 0013). */
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { mandant } from './stammdaten';
import { fahrzeug } from './fahrzeugakte';
import { fahrer } from './kunde';
import { miete } from './miete';

export const schluessel = pgTable(
  'schluessel',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    mieteId: uuid('miete_id')
      .notNull()
      .references(() => miete.id),
    fahrerId: uuid('fahrer_id')
      .notNull()
      .references(() => fahrer.id),
    fahrzeugId: uuid('fahrzeug_id')
      .notNull()
      .references(() => fahrzeug.id),
    status: text('status').notNull().default('aktiv'),
    gueltigVon: timestamp('gueltig_von', { withTimezone: true }).notNull(),
    /** `null`: bis zum Ende der Miete. */
    gueltigBis: timestamp('gueltig_bis', { withTimezone: true }),
    anbieterRef: text('anbieter_ref'),
    ausgestelltVon: text('ausgestellt_von').notNull(),
    widerrufenAm: timestamp('widerrufen_am', { withTimezone: true }),
    widerrufenVon: text('widerrufen_von'),
    widerrufGrund: text('widerruf_grund'),
    erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
    aktualisiertAm: timestamp('aktualisiert_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_schluessel_aktiv')
      .on(t.mieteId, t.fahrerId)
      .where(sql`status = 'aktiv'`),
    index('idx_schluessel_miete').on(t.mieteId),
    index('idx_schluessel_fahrer_status').on(t.fahrerId, t.status),
  ],
);

export const fahrzeugBefehl = pgTable(
  'fahrzeug_befehl',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    fahrzeugId: uuid('fahrzeug_id')
      .notNull()
      .references(() => fahrzeug.id),
    mieteId: uuid('miete_id').references(() => miete.id),
    /** `null`: direkt durch Ops/Admin, nicht mit einem Fahrerschlüssel. */
    schluesselId: uuid('schluessel_id').references(() => schluessel.id),
    befehl: text('befehl').notNull(),
    status: text('status').notNull(),
    /** Ablehnungsgründe des Kerns bzw. Fehlermeldung des Anbieters. */
    gruende: jsonb('gruende').$type<string[] | null>(),
    /** Begründung bei Befehlen durch Ops/Admin. */
    grund: text('grund'),
    angefordertVon: text('angefordert_von').notNull(),
    angefordertAm: timestamp('angefordert_am', { withTimezone: true }).notNull().defaultNow(),
    abgeschlossenAm: timestamp('abgeschlossen_am', { withTimezone: true }),
    anbieterRef: text('anbieter_ref'),
    idempotencyKey: text('idempotency_key').notNull(),
  },
  (t) => [
    uniqueIndex('uq_befehl_idempotency').on(t.mandantId, t.idempotencyKey),
    index('idx_befehl_fahrzeug_zeit').on(t.fahrzeugId, t.angefordertAm.desc()),
  ],
);
