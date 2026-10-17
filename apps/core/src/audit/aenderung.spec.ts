import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ermittleAenderungen, pruefeVersion, versionVon } from './aenderung';

describe('ermittleAenderungen', () => {
  it('liefert nur geänderte Felder mit altem und neuem Wert', () => {
    const r = ermittleAenderungen(
      { ort: 'Berlin', plz: '10115', ustId: 'DE1', land: 'DE' },
      { ort: 'Potsdam', plz: '10115', ustId: null, land: undefined },
    );
    expect(r.felder).toEqual(['ort', 'ustId']);
    expect(r.alt).toEqual({ ort: 'Berlin', ustId: 'DE1' });
    expect(r.neu).toEqual({ ort: 'Potsdam', ustId: null });
  });

  it('vergleicht Zeitpunkte über ihren ISO-Wert und behandelt null/undefined gleich', () => {
    const d = new Date('2030-12-31T22:59:00.000Z');
    expect(ermittleAenderungen({ bis: d, vin: null }, { bis: new Date(d), vin: null }).felder).toEqual([]);
    const r = ermittleAenderungen({ bis: d }, { bis: new Date('2031-01-31T22:59:00.000Z') });
    expect(r.alt).toEqual({ bis: '2030-12-31T22:59:00.000Z' });
    expect(r.neu).toEqual({ bis: '2031-01-31T22:59:00.000Z' });
  });

  it('unterscheidet Wahrheitswerte und Zahlen', () => {
    expect(ermittleAenderungen({ a: false, m: 3500 }, { a: true, m: 3500 }).felder).toEqual(['a']);
  });
});

describe('pruefeVersion', () => {
  const stand = new Date('2026-10-17T09:00:00.123Z');
  it('akzeptiert den gleichen Stand (auch mit anderer Zeitzonenschreibweise)', () => {
    expect(() => pruefeVersion(stand, versionVon(stand))).not.toThrow();
    expect(() => pruefeVersion(stand, '2026-10-17T11:00:00.123+02:00')).not.toThrow();
  });
  it('lehnt einen veralteten Stand mit 409 ab', () => {
    expect(() => pruefeVersion(stand, '2026-10-17T09:00:00.122Z')).toThrow(ConflictException);
  });
});
