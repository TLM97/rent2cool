import { describe, expect, it } from 'vitest';
import { erlaubteUebergaenge, istFahrzeugStatus, istUebergangErlaubt } from './fahrzeug';

describe('Fahrzeug-Statusmodell', () => {
  it('erlaubt gültige Übergänge', () => {
    expect(istUebergangErlaubt('angelegt', 'verfuegbar')).toBe(true);
    expect(istUebergangErlaubt('verfuegbar', 'reserviert')).toBe(true);
    expect(istUebergangErlaubt('vermietet', 'in_ruecknahme')).toBe(true);
  });

  it('verbietet ungültige Übergänge', () => {
    expect(istUebergangErlaubt('angelegt', 'vermietet')).toBe(false);
    expect(istUebergangErlaubt('stillgelegt', 'verfuegbar')).toBe(false);
  });

  it('kennt Statuswerte und Endzustand', () => {
    expect(istFahrzeugStatus('verfuegbar')).toBe(true);
    expect(istFahrzeugStatus('quatsch')).toBe(false);
    expect(erlaubteUebergaenge('stillgelegt')).toEqual([]);
  });
});
