import { describe, expect, it } from 'vitest';
import { uebergabeText } from './uebergabe';

const basis = { standortId: 's1', geprueftAm: '2026-10-17T12:00:00Z' };

describe('uebergabeText', () => {
  it('beschreibt die drei Ergebnisse', () => {
    expect(uebergabeText({ ...basis, ergebnis: 'im_bereich', abstandM: 35 })).toEqual({
      text: 'im Übergabebereich (35 m vom Mittelpunkt)',
      ton: 'ok',
    });
    expect(uebergabeText({ ...basis, ergebnis: 'ausserhalb', abstandM: 18_200 })).toEqual({
      text: 'außerhalb – 18,2 km vom Standort entfernt',
      ton: 'warn',
    });
    expect(
      uebergabeText({ ...basis, ergebnis: 'unbekannt', grund: 'Keine Position empfangen' }),
    ).toEqual({
      text: 'unbekannt – Keine Position empfangen',
      ton: 'neutral',
    });
  });
});
