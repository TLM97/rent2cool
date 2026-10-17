import { describe, expect, it } from 'vitest';
import { abstandMeter, abstandText, pruefeUebergabebereich } from './geo';

const zentrum = { lat: 51.2, lng: 10.4 };
const jetzt = new Date('2026-10-17T12:00:00Z');
const vor = (min: number) => new Date(jetzt.getTime() - min * 60_000).toISOString();

describe('abstandMeter', () => {
  it('rechnet bekannte Abstände (1/1000 Grad Breite ≈ 111 m)', () => {
    expect(abstandMeter(zentrum, zentrum)).toBe(0);
    expect(abstandMeter(zentrum, { lat: 51.201, lng: 10.4 })).toBeCloseTo(111.2, 0);
    // Berlin – München ≈ 504 km
    expect(
      abstandMeter({ lat: 52.52, lng: 13.405 }, { lat: 48.137, lng: 11.575 }) / 1000,
    ).toBeCloseTo(504, -1);
  });
});

describe('pruefeUebergabebereich', () => {
  const geofence = { ...zentrum, radiusM: 300 };
  const basis = { standortId: 's1', geofence, zeitpunkt: jetzt };

  it('im Bereich und außerhalb, mit Abstand', () => {
    const drin = pruefeUebergabebereich({
      ...basis,
      position: { lat: 51.2015, lng: 10.4, zeit: vor(2) },
    });
    expect(drin).toMatchObject({
      ergebnis: 'im_bereich',
      abstandM: 167,
      radiusM: 300,
      standortId: 's1',
    });
    const draussen = pruefeUebergabebereich({
      ...basis,
      position: { lat: 51.3, lng: 10.4, zeit: vor(2) },
    });
    expect(draussen.ergebnis).toBe('ausserhalb');
    expect(draussen.abstandM).toBeGreaterThan(11_000);
  });

  it('unbekannt ohne Standort, Geofence oder (aktuelle) Position – nie stillschweigend im Bereich', () => {
    const pos = { ...zentrum, zeit: vor(2) };
    expect(pruefeUebergabebereich({ ...basis, standortId: null, position: pos }).grund).toBe(
      'Kein Standort festgelegt',
    );
    expect(pruefeUebergabebereich({ ...basis, geofence: null, position: pos }).grund).toBe(
      'Standort ohne Geofence',
    );
    expect(pruefeUebergabebereich({ ...basis, position: null }).grund).toBe(
      'Keine Position empfangen',
    );
    const alt = pruefeUebergabebereich({ ...basis, position: { ...zentrum, zeit: vor(45) } });
    expect(alt).toMatchObject({ ergebnis: 'unbekannt', grund: 'Letzte Position ist 45 Min. alt' });
  });

  it('lesbarer Abstand', () => {
    expect(abstandText(35.4)).toBe('35 m');
    expect(abstandText(2400)).toBe('2,4 km');
  });
});
