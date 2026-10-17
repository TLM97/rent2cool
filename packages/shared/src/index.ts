/**
 * @rent2cool/shared
 *
 * Geteilte Typen und kleine, nicht-fachliche Hilfen für alle Pakete
 * (ein Typsystem von der Datenbank bis zur App, D-001).
 *
 * Bewusst klein gehalten: Das fachliche Datenmodell und die Statusmodelle
 * sind noch ein Vorschlag zur Prüfung durch die Planung (T-002,
 * docs/datenmodell.md) und werden erst nach Freigabe als Code/Migration
 * umgesetzt. Hier liegen nur Bausteine, die T-001 schon braucht.
 */
export * from './ids';
export * from './tenancy';
export * from './health';
export * from './telemetry';
export * from './auth';
export * from './bericht';
export * from './fahrzeug';
export * from './kunde';
export * from './miete';
export * from './rechnung';
export * from './alarm';
export * from './eingaben';
