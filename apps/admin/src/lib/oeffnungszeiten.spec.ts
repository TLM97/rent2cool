import { describe, expect, it } from 'vitest';
import { formularWerte, hatMehrFenster, regelnAusFormular } from './oeffnungszeiten';

describe('Öffnungszeiten im Formular', () => {
  it('baut Regeln aus Feldern; leere Tage sind geschlossen; 00:00 als Ende = Mitternacht', () => {
    const r = regelnAusFormular({
      oz_mo_von1: '06:00',
      oz_mo_bis1: '12:00',
      oz_mo_von2: '13:00',
      oz_mo_bis2: '00:00',
      oz_sa_von1: '08:00',
      oz_sa_bis1: '14:00',
    });
    expect(r).toEqual({
      ok: true,
      regeln: {
        zeitzone: 'Europe/Berlin',
        woche: {
          mo: [
            { von: '06:00', bis: '12:00' },
            { von: '13:00', bis: '24:00' },
          ],
          sa: [{ von: '08:00', bis: '14:00' }],
        },
      },
    });
  });

  it('rund um die Uhr = keine Regeln', () => {
    expect(regelnAusFormular({ oz_rund: 'on', oz_mo_von1: '06:00' })).toEqual({
      ok: true,
      regeln: null,
    });
  });

  it('Fehler am Feld: halb ausgefüllt, Ende vor Beginn', () => {
    expect(regelnAusFormular({ oz_di_von1: '06:00' })).toEqual({
      ok: false,
      feldFehler: { oz_di_bis1: 'Beginn und Ende angeben' },
    });
    expect(regelnAusFormular({ oz_mi_von1: '22:00', oz_mi_bis1: '06:00' })).toEqual({
      ok: false,
      feldFehler: { oz_mi_bis1: 'Ende muss nach dem Beginn liegen' },
    });
  });

  it('Rückweg: Formularwerte aus Regeln (24:00 → 00:00)', () => {
    expect(formularWerte(null)).toEqual({ oz_rund: 'on' });
    expect(
      formularWerte({ zeitzone: 'Europe/Berlin', woche: { fr: [{ von: '13:00', bis: '24:00' }] } }),
    ).toEqual({ oz_fr_von1: '13:00', oz_fr_bis1: '00:00' });
  });

  it('erkennt Regeln mit mehr Fenstern als das Formular zeigt', () => {
    const drei = [
      { von: '06:00', bis: '08:00' },
      { von: '09:00', bis: '10:00' },
      { von: '11:00', bis: '12:00' },
    ];
    expect(hatMehrFenster({ zeitzone: 'Europe/Berlin', woche: { mo: drei } })).toBe(true);
    expect(hatMehrFenster(null)).toBe(false);
  });
});
