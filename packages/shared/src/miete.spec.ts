import { describe, expect, it } from 'vitest';
import { istMieteStatus, istMieteUebergangErlaubt } from './miete';

describe('Miete-Statusmodell', () => {
  it('erlaubt gültige Übergänge', () => {
    expect(istMieteUebergangErlaubt('angefragt', 'bestaetigt')).toBe(true);
    expect(istMieteUebergangErlaubt('bestaetigt', 'aktiv')).toBe(true);
    expect(istMieteUebergangErlaubt('aktiv', 'beendet')).toBe(true);
    expect(istMieteUebergangErlaubt('beendet', 'abgerechnet')).toBe(true);
    expect(istMieteUebergangErlaubt('angefragt', 'storniert')).toBe(true);
  });
  it('verbietet ungültige Übergänge', () => {
    expect(istMieteUebergangErlaubt('aktiv', 'storniert')).toBe(false);
    expect(istMieteUebergangErlaubt('abgerechnet', 'aktiv')).toBe(false);
    expect(istMieteUebergangErlaubt('angefragt', 'aktiv')).toBe(false);
  });
  it('kennt Statuswerte', () => {
    expect(istMieteStatus('aktiv')).toBe(true);
    expect(istMieteStatus('quatsch')).toBe(false);
  });
});
