/**
 * Gemeinsame Form der Health-/Readiness-Antworten (D-005: Gesundheits- und
 * Bereitschafts-Endpunkte je Dienst). Website/Admin/App können dieselbe Form
 * konsumieren.
 */
export type HealthState = 'ok' | 'degraded' | 'down';

export interface HealthReport {
  readonly status: HealthState;
  /** ISO-8601 in UTC (CLAUDE.md: alle Zeitstempel in UTC). */
  readonly time: string;
  readonly service: string;
  /** Einzelne Prüfungen (z. B. db, queue, storage); bei Liveness leer. */
  readonly checks?: Readonly<Record<string, HealthState>>;
}

export function nowUtcIso(): string {
  return new Date().toISOString();
}
