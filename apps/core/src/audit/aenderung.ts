/**
 * Bausteine für Stammdaten-Änderungen: welche Felder haben sich geändert
 * (alter und neuer Wert für den Audit Trail) und ist der Datensatz noch auf
 * dem Stand, den der Bearbeiter gesehen hat (Schutz vor verlorenen Änderungen)?
 */
import { ConflictException } from '@nestjs/common';

export interface Aenderungen {
  /** Geänderte Feldnamen, in Eingabereihenfolge. */
  felder: string[];
  alt: Record<string, unknown>;
  neu: Record<string, unknown>;
}

function normal(wert: unknown): unknown {
  if (wert instanceof Date) return wert.toISOString();
  return wert ?? null;
}

/**
 * Vergleicht die Eingabe mit dem gespeicherten Datensatz. Felder, die in der
 * Eingabe fehlen (`undefined`), bleiben unberührt; `null` leert ein Feld.
 * Zeitpunkte werden als ISO-Text verglichen und protokolliert.
 */
export function ermittleAenderungen(
  vorher: Record<string, unknown>,
  eingabe: Record<string, unknown>,
): Aenderungen {
  const ergebnis: Aenderungen = { felder: [], alt: {}, neu: {} };
  for (const [feld, wert] of Object.entries(eingabe)) {
    if (wert === undefined) continue;
    const a = normal(vorher[feld]);
    const n = normal(wert);
    if (a === n) continue;
    ergebnis.felder.push(feld);
    ergebnis.alt[feld] = a;
    ergebnis.neu[feld] = n;
  }
  return ergebnis;
}

/** Versionsstempel, den Oberflächen beim Speichern zurückschicken. */
export function versionVon(aktualisiertAm: Date): string {
  return aktualisiertAm.toISOString();
}

/**
 * Optimistische Sperre über `aktualisiertAm` (Millisekunden). Hat seit dem
 * Öffnen des Formulars jemand anderes gespeichert, wird abgelehnt statt
 * überschrieben.
 */
export function pruefeVersion(aktualisiertAm: Date, version: string): void {
  if (new Date(version).getTime() !== aktualisiertAm.getTime()) {
    throw new ConflictException(
      'Der Datensatz wurde inzwischen von jemand anderem geändert. Bitte die Seite neu laden und die Änderung erneut eintragen.',
    );
  }
}

/** Antwort der Änderungs-Endpunkte. */
export interface StammdatenErgebnis {
  id: string;
  /** Neuer Versionsstempel für die nächste Änderung. */
  version: string;
  /** Tatsächlich geänderte Felder (leer: nichts zu tun, kein Audit-Eintrag). */
  geaendert: string[];
}

/** Nur die geänderten Felder der Eingabe, in ihrer Originalform (z. B. Date) – für das UPDATE. */
export function neueWerte<T extends Record<string, unknown>>(
  eingabe: T,
  a: Aenderungen,
): Partial<T> {
  return Object.fromEntries(a.felder.map((f) => [f, eingabe[f]])) as Partial<T>;
}
