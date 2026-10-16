import { describe, expect, it } from 'vitest';
import {
  bewerteFahrerEinsatz,
  istFahrerUebergangErlaubt,
  istKundeUebergangErlaubt,
  klasseDeckt,
} from './kunde';

describe('Kunde-/Fahrer-Statusmodelle', () => {
  it('Kunde: gültige und ungültige Übergänge', () => {
    expect(istKundeUebergangErlaubt('angelegt', 'in_pruefung')).toBe(true);
    expect(istKundeUebergangErlaubt('in_pruefung', 'freigegeben')).toBe(true);
    expect(istKundeUebergangErlaubt('angelegt', 'freigegeben')).toBe(false);
  });
  it('Fahrer: gültige und ungültige Übergänge', () => {
    expect(istFahrerUebergangErlaubt('identitaet_pruefung', 'freigegeben')).toBe(true);
    expect(istFahrerUebergangErlaubt('freigegeben', 'gesperrt')).toBe(true);
    expect(istFahrerUebergangErlaubt('abgelehnt', 'freigegeben')).toBe(false);
  });
});

describe('Führerscheinklassen-Abdeckung', () => {
  it('B deckt B, nicht C', () => {
    expect(klasseDeckt('B', 'B')).toBe(true);
    expect(klasseDeckt('B', 'C')).toBe(false);
  });
  it('C1 deckt B', () => {
    expect(klasseDeckt('C1', 'B')).toBe(true);
  });
});

describe('bewerteFahrerEinsatz (R-22)', () => {
  const zukunft = new Date('2027-01-01T00:00:00Z');
  const jetzt = new Date('2026-10-16T12:00:00Z');

  it('einsatzbereit bei freigegeben + gültig + passender Klasse', () => {
    const r = bewerteFahrerEinsatz(
      { status: 'freigegeben', fuehrerscheinKlasse: 'B', fuehrerscheinGueltigBis: zukunft },
      'B',
      jetzt,
    );
    expect(r.einsatzbereit).toBe(true);
  });

  it('nicht einsatzbereit bei abgelaufenem Führerschein', () => {
    const r = bewerteFahrerEinsatz(
      {
        status: 'freigegeben',
        fuehrerscheinKlasse: 'B',
        fuehrerscheinGueltigBis: new Date('2026-01-01T00:00:00Z'),
      },
      'B',
      jetzt,
    );
    expect(r.einsatzbereit).toBe(false);
    expect(r.gruende[0]).toContain('abgelaufen');
  });

  it('nicht einsatzbereit bei nicht passender Klasse', () => {
    const r = bewerteFahrerEinsatz(
      { status: 'freigegeben', fuehrerscheinKlasse: 'B', fuehrerscheinGueltigBis: zukunft },
      'C',
      jetzt,
    );
    expect(r.einsatzbereit).toBe(false);
  });

  it('nicht einsatzbereit bei gesperrtem Fahrer', () => {
    const r = bewerteFahrerEinsatz(
      { status: 'gesperrt', fuehrerscheinKlasse: 'B', fuehrerscheinGueltigBis: zukunft },
      'B',
      jetzt,
    );
    expect(r.einsatzbereit).toBe(false);
  });
});
