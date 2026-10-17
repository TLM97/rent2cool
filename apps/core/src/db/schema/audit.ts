/**
 * Audit Trail (T-004, CLAUDE.md „nicht verhandelbar"). Jede schreibende Aktion
 * auf GDP-Daten erzeugt einen Eintrag: wer, wann, was, alter und neuer Wert.
 * Append-only; der Trigger in Migration 0002_audit weist UPDATE/DELETE ab.
 */
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const auditEvent = pgTable(
  'audit_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    zeit: timestamp('zeit', { withTimezone: true }).notNull().defaultNow(),
    akteurId: text('akteur_id').notNull(),
    /** Anmeldename zum Zeitpunkt der Aktion (lesbar); maßgeblich bleibt `akteurId`. */
    akteurName: text('akteur_name'),
    /** Alle Rollen des Akteurs, kommagetrennt (bis 0009: nur die erste). */
    akteurRolle: text('akteur_rolle'),
    aktion: text('aktion').notNull(),
    entitaetTyp: text('entitaet_typ').notNull(),
    entitaetId: text('entitaet_id'),
    altWert: jsonb('alt_wert'),
    neuWert: jsonb('neu_wert'),
    // Als Text (nicht uuid), damit der Audit-Sink nie an einem Token-Claim-Format scheitert.
    mandantId: text('mandant_id'),
    quelle: text('quelle').notNull(),
  },
  (t) => [
    index('idx_audit_entitaet').on(t.entitaetTyp, t.entitaetId, t.zeit.desc()),
    index('idx_audit_akteur').on(t.akteurId, t.zeit.desc()),
  ],
);

export type AuditEventInsert = typeof auditEvent.$inferInsert;
