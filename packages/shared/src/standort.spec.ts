import { describe, expect, it } from 'vitest';
import {
  istGeoeffnet,
  oeffnungsregelnSchema,
  oeffnungszeitenText,
  ortszeit,
  standortAendernSchema,
  standortErstellenSchema,
  type Oeffnungsregeln,
} from './standort';

const werktags: Oeffnungsregeln = oeffnungsregelnSchema.parse({
  woche: {
    mo: [{ von: '06:00', bis: '22:00' }],
    di: [{ von: '06:00', bis: '22:00' }],
    mi: [{ von: '06:00', bis: '22:00' }],
    do: [{ von: '06:00', bis: '22:00' }],
    fr: [
      { von: '06:00', bis: '12:00' },
      { von: '13:00', bis: '24:00' },
    ],
  },
});

describe('Öffnungsregeln', () => {
  it('Ortszeit berücksichtigt Sommer- und Winterzeit', () => {
    // Sommerzeit (UTC+2) und Winterzeit (UTC+1)
    expect(ortszeit(new Date('2026-07-06T04:30:00Z'), 'Europe/Berlin')).toEqual({
      tag: 'mo',
      uhrzeit: '06:30',
    });
    expect(ortszeit(new Date('2026-12-07T04:30:00Z'), 'Europe/Berlin')).toEqual({
      tag: 'mo',
      uhrzeit: '05:30',
    });
  });

  it('geöffnet innerhalb der Fenster, Ende exklusiv; Wochenende geschlossen', () => {
    expect(istGeoeffnet(werktags, new Date('2026-07-06T04:00:00Z'))).toBe(true); // Mo 06:00
    expect(istGeoeffnet(werktags, new Date('2026-07-06T03:59:00Z'))).toBe(false); // Mo 05:59
    expect(istGeoeffnet(werktags, new Date('2026-07-06T20:00:00Z'))).toBe(false); // Mo 22:00
    expect(istGeoeffnet(werktags, new Date('2026-07-10T10:30:00Z'))).toBe(false); // Fr 12:30 Pause
    expect(istGeoeffnet(werktags, new Date('2026-07-10T21:59:00Z'))).toBe(true); // Fr 23:59
    expect(istGeoeffnet(werktags, new Date('2026-07-11T10:00:00Z'))).toBe(false); // Sa
  });

  it('ohne Regeln rund um die Uhr', () => {
    expect(istGeoeffnet(null, new Date('2026-07-11T02:00:00Z'))).toBe(true);
    expect(oeffnungszeitenText(null)).toEqual(['rund um die Uhr']);
  });

  it('lesbarer Text je Tag', () => {
    const t = oeffnungszeitenText(werktags);
    expect(t[0]).toBe('Montag: 06:00–22:00');
    expect(t[4]).toBe('Freitag: 06:00–12:00, 13:00–24:00');
    expect(t[6]).toBe('Sonntag: geschlossen');
  });

  it('prüft Uhrzeiten und Reihenfolge', () => {
    expect(
      oeffnungsregelnSchema.safeParse({ woche: { mo: [{ von: '22:00', bis: '06:00' }] } }).success,
    ).toBe(false);
    expect(
      oeffnungsregelnSchema.safeParse({ woche: { mo: [{ von: '6:00', bis: '22:00' }] } }).success,
    ).toBe(false);
    expect(
      oeffnungsregelnSchema.safeParse({ woche: { mo: [{ von: '00:00', bis: '24:00' }] } }).success,
    ).toBe(true);
  });
});

describe('Standort-Eingaben', () => {
  it('Name ist Pflicht, Land Standard DE', () => {
    expect(standortErstellenSchema.safeParse({ name: ' ' }).success).toBe(false);
    expect(standortErstellenSchema.parse({ name: 'Nord' }).land).toBe('DE');
  });

  it('Geofence nur vollständig, Radius begrenzt', () => {
    expect(standortErstellenSchema.safeParse({ name: 'N', geofenceLat: 52.5 }).success).toBe(false);
    expect(
      standortErstellenSchema.safeParse({
        name: 'N',
        geofenceLat: '52.5',
        geofenceLng: '13.4',
        geofenceRadiusM: '300',
      }).success,
    ).toBe(true);
    expect(
      standortErstellenSchema.safeParse({
        name: 'N',
        geofenceLat: 52.5,
        geofenceLng: 13.4,
        geofenceRadiusM: 5,
      }).success,
    ).toBe(false);
  });

  it('Ändern verlangt die Version', () => {
    expect(standortAendernSchema.safeParse({ name: 'X' }).success).toBe(false);
    expect(
      standortAendernSchema.safeParse({ version: '2026-10-17T08:00:00Z', aktiv: false }).success,
    ).toBe(true);
  });
});
