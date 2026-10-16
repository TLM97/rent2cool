/**
 * apps/ingest – Telematik-Eingang (leeres Gerüst, T-001).
 *
 * Aufgabe (ausgebaut in T-003, siehe docs/TASKS.md):
 *  - nimmt herstellerneutrale Telematik-Nachrichten an
 *  - prüft Format und Signatur, vergibt KEINE eigenen IDs
 *    (die eindeutige ID bringt die Nachricht mit → Duplikaterkennung, D-003)
 *  - schreibt ausschließlich in die Warteschlange (Kafka-API) und antwortet schnell
 *
 * Eigener Prozess im selben Repo (D-001). Noch kein Code.
 */
export const INGEST_PLACEHOLDER = 'apps/ingest – ausgebaut in T-003' as const;
