import { describe, expect, it } from 'vitest';
import { formatRechnungsnummer, istRechnungUebergangErlaubt, rechneBetraege } from './rechnung';

describe('Rechnung-Statusmodell', () => {
  it('erlaubt/verbietet Übergänge', () => {
    expect(istRechnungUebergangErlaubt('entwurf', 'gestellt')).toBe(true);
    expect(istRechnungUebergangErlaubt('gestellt', 'bezahlt')).toBe(true);
    expect(istRechnungUebergangErlaubt('bezahlt', 'storniert')).toBe(false);
    expect(istRechnungUebergangErlaubt('entwurf', 'bezahlt')).toBe(false);
  });
});

describe('rechneBetraege', () => {
  it('rechnet 19% korrekt', () => {
    const b = rechneBetraege(10000, 19);
    expect(b.steuerCent).toBe(1900);
    expect(b.bruttoCent).toBe(11900);
  });
  it('rundet kaufmännisch', () => {
    // 19 % von 1 ct = 0,19 ct -> 0
    expect(rechneBetraege(1, 19).steuerCent).toBe(0);
    // 19 % von 3 ct = 0,57 ct -> 1
    expect(rechneBetraege(3, 19).steuerCent).toBe(1);
  });
});

describe('formatRechnungsnummer', () => {
  it('formatiert JAHR-00001', () => {
    expect(formatRechnungsnummer(2026, 1)).toBe('2026-00001');
    expect(formatRechnungsnummer(2026, 42)).toBe('2026-00042');
  });
});
