/**
 * Übergabeprotokoll im Formular (Ausnahmeprozess mit Personal, D-014):
 * Checkliste und Schäden zwischen Formularfeldern und Kern-Format umsetzen.
 * Feldnamen tragen die Protokollart als Präfix – Übergabe und Rückgabe können
 * gleichzeitig offen auf einer Seite stehen.
 */
import {
  CHECKLISTE,
  type ChecklistenAntwort,
  type ProtokollArt,
  type Schaden,
} from '@rent2cool/shared';

export const feldName = (art: ProtokollArt, name: string) => `${art}_${name}`;

/** Beantwortete Checklistenpunkte („ja“/„nein“ + Bemerkung); unbeantwortete fehlen. */
export function checklisteAusFormular(
  art: ProtokollArt,
  wert: (name: string) => string | undefined,
): Record<string, ChecklistenAntwort> {
  const ergebnis: Record<string, ChecklistenAntwort> = {};
  for (const punkt of CHECKLISTE[art]) {
    const antwort = wert(feldName(art, `check_${punkt.id}`));
    if (antwort !== 'ja' && antwort !== 'nein') continue;
    ergebnis[punkt.id] = {
      ok: antwort === 'ja',
      bemerkung: wert(feldName(art, `bemerkung_${punkt.id}`)) ?? null,
    };
  }
  return ergebnis;
}

/** Eine Zeile je Schaden. */
export function schaedenAusText(text: string | undefined): Schaden[] {
  return (text ?? '')
    .split('\n')
    .map((z) => z.trim())
    .filter(Boolean)
    .map((beschreibung) => ({ beschreibung }));
}

export function schaedenAlsText(schaeden: Schaden[] | null | undefined): string {
  return (schaeden ?? []).map((s) => s.beschreibung).join('\n');
}
