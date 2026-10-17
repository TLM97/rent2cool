/** Archiv der Temperaturnachweise je Miete (Migration 0015, unveränderbar). */
import type { NachweisKennzahlen } from '@rent2cool/shared';
import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { mandant } from './stammdaten';
import { miete } from './miete';

export const temperaturnachweisArchiv = pgTable(
  'temperaturnachweis_archiv',
  {
    id: uuid('id').primaryKey(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    mieteId: uuid('miete_id')
      .notNull()
      .references(() => miete.id),
    version: integer('version').notNull(),
    ausloeser: text('ausloeser').notNull(),
    erzeugtVon: text('erzeugt_von').notNull(),
    erzeugtAm: timestamp('erzeugt_am', { withTimezone: true }).notNull().defaultNow(),
    von: timestamp('von', { withTimezone: true }).notNull(),
    bis: timestamp('bis', { withTimezone: true }).notNull(),
    profil: text('profil').notNull(),
    bewertung: text('bewertung').notNull(),
    kennzahlen: jsonb('kennzahlen').$type<NachweisKennzahlen>().notNull(),
    anzahlGrenzverletzungen: integer('anzahl_grenzverletzungen').notNull(),
    anzahlLuecken: integer('anzahl_luecken').notNull(),
    datenHash: text('daten_hash').notNull(),
    signaturAlgorithmus: text('signatur_algorithmus').notNull(),
    datenSignatur: text('daten_signatur').notNull(),
    jsonSchluessel: text('json_schluessel').notNull(),
    jsonSha256: text('json_sha256').notNull(),
    jsonGroesse: integer('json_groesse').notNull(),
    pdfSchluessel: text('pdf_schluessel').notNull(),
    pdfSha256: text('pdf_sha256').notNull(),
    pdfGroesse: integer('pdf_groesse').notNull(),
    dokumentSignatur: text('dokument_signatur').notNull(),
  },
  (t) => [
    uniqueIndex('uq_archiv_miete_version').on(t.mieteId, t.version),
    uniqueIndex('uq_archiv_miete_automatisch')
      .on(t.mieteId)
      .where(sql`ausloeser = 'automatisch'`),
  ],
);
