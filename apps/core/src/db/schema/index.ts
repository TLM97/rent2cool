/**
 * Drizzle-Schema (Tabellen) des Kerns.
 *
 * Der Telematik-Pfad (T-003) ist umgesetzt: siehe `telemetrie.ts`. Das
 * breitere fachliche Datenmodell (T-002, docs/datenmodell.md) ist noch ein
 * Vorschlag zur Prüfung durch die Planung und wird erst nach Freigabe hier
 * ergänzt.
 *
 * Nicht verhandelbar beim Ausbau (CLAUDE.md): Audit Trail ab dem ersten
 * Schema, Messwerte unveränderbar (nur anhängen), alle Zeitstempel in UTC,
 * Standort/Mandant in jedem relevanten Datensatz.
 */
export * from './telemetrie';
export * from './audit';
export * from './stammdaten';
export * from './fahrzeugakte';
export * from './kunde';
export * from './miete';
export * from './rechnung';
export * from './alarm';
