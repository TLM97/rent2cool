/**
 * Drizzle-Schema für den Telematik-Pfad (T-003). Die Hypertable-Eigenschaft
 * und der Append-only-Trigger von `messwert` stecken in der Migration
 * 0001_telemetrie (Drizzle sieht nur die Tabelle).
 */
import {
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from 'drizzle-orm/pg-core';

/** Duplikaterkennung: eine Zeile je verarbeiteter Nachricht. */
export const telemetrieNachricht = pgTable('telemetrie_nachricht', {
  nachrichtId: text('nachricht_id').primaryKey(),
  fahrzeugId: uuid('fahrzeug_id').notNull(),
  quelle: text('quelle').notNull(),
  gesendetAm: timestamp('gesendet_am', { withTimezone: true }).notNull(),
  empfangenAm: timestamp('empfangen_am', { withTimezone: true }).notNull().defaultNow(),
  werteAnzahl: integer('werte_anzahl').notNull(),
});

/** Messwerte als unveränderbare Zeitreihe (Hypertable, append-only). */
export const messwert = pgTable(
  'messwert',
  {
    zeit: timestamp('zeit', { withTimezone: true }).notNull(),
    fahrzeugId: uuid('fahrzeug_id').notNull(),
    messgroesse: text('messgroesse').notNull(),
    wert: doublePrecision('wert').notNull(),
    einheit: text('einheit').notNull(),
    nachrichtId: text('nachricht_id').notNull(),
    quelle: text('quelle').notNull(),
    mieteId: uuid('miete_id'),
  },
  (t) => [
    index('idx_messwert_fahrzeug_zeit').on(t.fahrzeugId, t.zeit.desc()),
    index('idx_messwert_messgroesse_zeit').on(t.messgroesse, t.zeit.desc()),
    index('idx_messwert_nachricht').on(t.nachrichtId),
  ],
);

export type MesswertInsert = typeof messwert.$inferInsert;
export type TelemetrieNachrichtInsert = typeof telemetrieNachricht.$inferInsert;
