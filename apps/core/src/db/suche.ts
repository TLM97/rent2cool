/**
 * Freitextsuche: Eingabe als LIKE-Muster „enthält“, Platzhalterzeichen der
 * Eingabe (%, _, \) wirken nicht als Platzhalter. Leere Eingabe → undefined
 * (kein Filter).
 */
export function enthaeltMuster(eingabe: string | undefined): string | undefined {
  const t = eingabe?.trim();
  if (!t) return undefined;
  return `%${t.replace(/[\\%_]/g, (z) => `\\${z}`)}%`;
}
