import { describe, expect, it } from 'vitest';
import { checklisteAusFormular, feldName, schaedenAlsText, schaedenAusText } from './protokoll';

describe('Protokoll im Formular', () => {
  it('Checkliste: nur beantwortete Punkte, mit Bemerkung', () => {
    const felder: Record<string, string> = {
      [feldName('rueckgabe', 'check_laderaum_leer')]: 'ja',
      [feldName('rueckgabe', 'check_keine_neuen_schaeden')]: 'nein',
      [feldName('rueckgabe', 'bemerkung_keine_neuen_schaeden')]: 'Delle Heck',
      [feldName('uebergabe', 'check_laderaum_sauber')]: 'ja',
    };
    expect(checklisteAusFormular('rueckgabe', (n) => felder[n])).toEqual({
      laderaum_leer: { ok: true, bemerkung: null },
      keine_neuen_schaeden: { ok: false, bemerkung: 'Delle Heck' },
    });
  });

  it('Schäden: eine Zeile je Schaden, Leerzeilen ignoriert', () => {
    const s = schaedenAusText(' Kratzer Tür links \n\nDelle Heck\n');
    expect(s).toEqual([{ beschreibung: 'Kratzer Tür links' }, { beschreibung: 'Delle Heck' }]);
    expect(schaedenAlsText(s)).toBe('Kratzer Tür links\nDelle Heck');
    expect(schaedenAusText(undefined)).toEqual([]);
  });
});
