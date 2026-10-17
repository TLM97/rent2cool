/** Anzeige der Übergabebereich-Prüfung (Text und Farbton). */
import { abstandText, type UebergabePruefung } from '@rent2cool/shared';
import type { Ton } from './format';

export function uebergabeText(p: UebergabePruefung): { text: string; ton: Ton } {
  if (p.ergebnis === 'im_bereich') {
    return {
      text: `im Übergabebereich (${abstandText(p.abstandM ?? 0)} vom Mittelpunkt)`,
      ton: 'ok',
    };
  }
  if (p.ergebnis === 'ausserhalb') {
    return {
      text: `außerhalb – ${abstandText(p.abstandM ?? 0)} vom Standort entfernt`,
      ton: 'warn',
    };
  }
  return { text: `unbekannt – ${p.grund ?? 'keine Angabe'}`, ton: 'neutral' };
}
