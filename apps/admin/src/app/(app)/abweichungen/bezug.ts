/** Anzeige und Verlinkung des Bezugs einer Abweichung (Alarm, Miete, Fahrzeug). */
export const BEZUG: Record<string, string> = { alarm: 'Alarm', miete: 'Miete', fahrzeug: 'Fahrzeug' };

export const SCHWEREGRADE = ['niedrig', 'mittel', 'hoch', 'kritisch'] as const;

/** Alarme haben keine eigene Seite – sie stehen in der Alarmliste. */
export function bezugLink(typ: string, id: string): string {
  if (typ === 'miete') return `/mieten/${id}`;
  if (typ === 'fahrzeug') return `/fahrzeuge/${id}`;
  return '/alarme';
}
