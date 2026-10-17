/**
 * PostgreSQL-Fehler erkennen. postgres.js liefert SQLSTATE und Constraint-Namen
 * als Felder (`code`, `constraint_name`), nicht im Fehlertext – Textvergleiche
 * greifen deshalb nicht.
 */
export const PG_FEHLER = {
  /** unique_violation */
  EINDEUTIG: '23505',
  /** exclusion_violation (z. B. überlappende Zeiträume) */
  AUSSCHLUSS: '23P01',
} as const;

interface PgFehlerFelder {
  code?: unknown;
  constraint_name?: unknown;
  cause?: unknown;
}

/** Fehlerfelder, auch wenn der Fehler eingepackt wurde (`cause`). */
function felder(e: unknown): PgFehlerFelder | undefined {
  let aktuell: unknown = e;
  for (let i = 0; i < 3 && typeof aktuell === 'object' && aktuell !== null; i++) {
    const f = aktuell as PgFehlerFelder;
    if (typeof f.code === 'string') return f;
    aktuell = f.cause;
  }
  return undefined;
}

/** Ist `e` ein PostgreSQL-Fehler mit diesem SQLSTATE (und optional dieser Constraint)? */
export function istPgFehler(e: unknown, code: string, constraint?: string): boolean {
  const f = felder(e);
  if (!f || f.code !== code) return false;
  return constraint === undefined || f.constraint_name === constraint;
}

/** Abbrüche, nach denen eine Wiederholung derselben Transaktion gelingen kann. */
const WIEDERHOLBAR = ['40P01' /* deadlock_detected */, '40001' /* serialization_failure */];

/**
 * Führt `fn` aus und wiederholt bei Deadlock/Serialisierungsfehler (kurze,
 * zufällige Pause). Typisch bei gleichzeitigen Schreibvorgängen gegen
 * Exclusion-Constraints: beim nächsten Versuch ist die andere Transaktion
 * fertig und es kommt die eigentliche Antwort (z. B. „bereits gebucht“).
 * Nur für ganze Transaktionen verwenden, nicht innerhalb einer laufenden.
 */
export async function mitWiederholung<T>(
  fn: () => Promise<T>,
  versuche = 4,
  warte: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  for (let versuch = 1; ; versuch++) {
    try {
      return await fn();
    } catch (e) {
      const wiederholbar = WIEDERHOLBAR.some((code) => istPgFehler(e, code));
      if (!wiederholbar || versuch >= versuche) throw e;
      await warte(10 * versuch + Math.floor(Math.random() * 40));
    }
  }
}
