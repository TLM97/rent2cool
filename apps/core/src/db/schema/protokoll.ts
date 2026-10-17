/** Übergabe-/Rückgabeprotokoll mit Foto-Check (D-014, Migration 0014). */
import type { ChecklistenAntwort, Schaden } from '@rent2cool/shared';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { mandant } from './stammdaten';
import { fahrzeug } from './fahrzeugakte';
import { miete } from './miete';

export const uebergabeprotokoll = pgTable(
  'uebergabeprotokoll',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    mieteId: uuid('miete_id')
      .notNull()
      .references(() => miete.id),
    fahrzeugId: uuid('fahrzeug_id')
      .notNull()
      .references(() => fahrzeug.id),
    art: text('art').notNull(),
    status: text('status').notNull().default('offen'),
    kmStand: integer('km_stand'),
    checkliste: jsonb('checkliste').$type<Record<string, ChecklistenAntwort> | null>(),
    schaeden: jsonb('schaeden').$type<Schaden[] | null>(),
    erstelltVon: text('erstellt_von').notNull(),
    erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
    abgeschlossenAm: timestamp('abgeschlossen_am', { withTimezone: true }),
    abgeschlossenVon: text('abgeschlossen_von'),
    aktualisiertAm: timestamp('aktualisiert_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_protokoll_miete_art').on(t.mieteId, t.art),
    index('idx_protokoll_fahrzeug_zeit').on(t.fahrzeugId, t.erstelltAm.desc()),
  ],
);

export const protokollFoto = pgTable(
  'protokoll_foto',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    protokollId: uuid('protokoll_id')
      .notNull()
      .references(() => uebergabeprotokoll.id),
    perspektive: text('perspektive').notNull(),
    objektSchluessel: text('objekt_schluessel').notNull(),
    contentType: text('content_type').notNull(),
    groesse: integer('groesse').notNull(),
    sha256: text('sha256').notNull(),
    status: text('status').notNull().default('angefordert'),
    verwurfGrund: text('verwurf_grund'),
    aufgenommenAm: timestamp('aufgenommen_am', { withTimezone: true }),
    angefordertVon: text('angefordert_von').notNull(),
    angefordertAm: timestamp('angefordert_am', { withTimezone: true }).notNull().defaultNow(),
    hochgeladenAm: timestamp('hochgeladen_am', { withTimezone: true }),
    idempotencyKey: text('idempotency_key').notNull(),
  },
  (t) => [
    uniqueIndex('uq_foto_objekt').on(t.objektSchluessel),
    uniqueIndex('uq_foto_idempotency').on(t.mandantId, t.idempotencyKey),
    index('idx_foto_protokoll').on(t.protokollId),
  ],
);
