import type { Ton } from './format';

/** Anzeige der Führerschein-Frist (R-22): abgelaufen / läuft bald ab / gültig. */
export function fuehrerscheinFrist(
  gueltigBis: string | null,
  jetztMs = Date.now(),
  warnTage = 30,
): { text: string; ton: Ton } {
  if (!gueltigBis) return { text: 'kein Datum', ton: 'kritisch' };
  const ende = new Date(gueltigBis).getTime();
  if (Number.isNaN(ende)) return { text: 'kein Datum', ton: 'kritisch' };
  const tage = Math.floor((ende - jetztMs) / 86_400_000);
  if (tage < 0) return { text: 'abgelaufen', ton: 'kritisch' };
  if (tage <= warnTage) return { text: `läuft in ${tage} T. ab`, ton: 'warn' };
  return { text: 'gültig', ton: 'ok' };
}
