import type { Ton } from './format';

/** Fristanzeige: abgelaufen / läuft bald ab / gültig. `ohneText`, wenn kein Datum vorliegt. */
function frist(
  gueltigBis: string | null,
  ohneText: string,
  jetztMs: number,
  warnTage: number,
): { text: string; ton: Ton } {
  if (!gueltigBis) return { text: ohneText, ton: 'kritisch' };
  const ende = new Date(gueltigBis).getTime();
  if (Number.isNaN(ende)) return { text: ohneText, ton: 'kritisch' };
  const tage = Math.floor((ende - jetztMs) / 86_400_000);
  if (tage < 0) return { text: 'abgelaufen', ton: 'kritisch' };
  if (tage <= warnTage) return { text: `läuft in ${tage} T. ab`, ton: 'warn' };
  return { text: 'gültig', ton: 'ok' };
}

/** Führerschein-Frist (R-22). */
export function fuehrerscheinFrist(gueltigBis: string | null, jetztMs = Date.now(), warnTage = 30) {
  return frist(gueltigBis, 'kein Datum', jetztMs, warnTage);
}

/** Kalibrier-Frist eines Sensors (R-08/R-09); ohne Kalibrierung nicht buchbar. */
export function kalibrierungFrist(gueltigBis: string | null, jetztMs = Date.now(), warnTage = 30) {
  return frist(gueltigBis, 'nicht kalibriert', jetztMs, warnTage);
}
