/**
 * Firmenkunde (D-010) und Fahrer (gehört zum Kunden, D-004). Arbeitsgrundlage
 * nach T-002. Fahrerdaten sind personenbezogen (DSGVO) – nur Testdaten (D-015).
 */
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { mandant } from './stammdaten';

export const kunde = pgTable(
  'kunde',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    firmenname: text('firmenname').notNull(),
    handelsregisternummer: text('handelsregisternummer'),
    ustId: text('ust_id'),
    strasse: text('strasse'),
    plz: text('plz'),
    ort: text('ort'),
    land: text('land').notNull().default('DE'),
    /** QA-Kontakt für Temperaturnachweise per E-Mail (F-46, Migration 0017). */
    nachweisEmail: text('nachweis_email'),
    status: text('status').notNull().default('angelegt'),
    erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
    aktualisiertAm: timestamp('aktualisiert_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_kunde_mandant_status').on(t.mandantId, t.status),
    index('idx_kunde_ust').on(t.ustId),
  ],
);

export const fahrer = pgTable(
  'fahrer',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kundeId: uuid('kunde_id')
      .notNull()
      .references(() => kunde.id),
    name: text('name').notNull(),
    fuehrerscheinKlasse: text('fuehrerschein_klasse').notNull(),
    fuehrerscheinNummer: text('fuehrerschein_nummer'),
    fuehrerscheinGueltigBis: timestamp('fuehrerschein_gueltig_bis', { withTimezone: true }),
    identitaetspruefungStatus: text('identitaetspruefung_status').notNull().default('offen'),
    status: text('status').notNull().default('angelegt'),
    letztePruefungAm: timestamp('letzte_pruefung_am', { withTimezone: true }),
    /** Login-Konto (Keycloak-Benutzer-ID) für die App; eindeutig (Migration 0013). */
    kontoId: text('konto_id'),
    erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
    aktualisiertAm: timestamp('aktualisiert_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_fahrer_kunde_status').on(t.kundeId, t.status),
    index('idx_fahrer_fs_gueltig').on(t.fuehrerscheinGueltigBis),
  ],
);

/** Login eines Kunden-Mitarbeiters → Kunde (F-41, Migration 0018). */
export const kundeKonto = pgTable(
  'kunde_konto',
  {
    kontoId: text('konto_id').primaryKey(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    kundeId: uuid('kunde_id')
      .notNull()
      .references(() => kunde.id),
    bezeichnung: text('bezeichnung'),
    erstelltVon: text('erstellt_von').notNull(),
    erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_kunde_konto_kunde').on(t.kundeId)],
);
