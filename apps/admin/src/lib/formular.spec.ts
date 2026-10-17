import { describe, expect, it } from 'vitest';
import { istKundeUebergangErlaubt, KUNDE_STATUS } from '@rent2cool/shared';
import {
  berlinLokalZuIso,
  berlinTagesendeZuIso,
  betrag,
  feldFehlerAus,
  haken,
  isoZuBerlinLokal,
  naechsteStatus,
  text,
  werteAus,
} from './formular';

function fd(werte: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
}

describe('Ortszeit ↔ UTC (Europa/Berlin)', () => {
  it('rechnet Sommerzeit (UTC+2) um', () => {
    expect(berlinLokalZuIso('2026-07-01T10:00')).toBe('2026-07-01T08:00:00.000Z');
  });
  it('rechnet Winterzeit (UTC+1) um', () => {
    expect(berlinLokalZuIso('2026-01-15T10:00')).toBe('2026-01-15T09:00:00.000Z');
  });
  it('trifft den Tag der Zeitumstellung korrekt', () => {
    // 25.10.2026: um 03:00 MESZ wird auf 02:00 MEZ zurückgestellt.
    expect(berlinLokalZuIso('2026-10-25T12:00')).toBe('2026-10-25T11:00:00.000Z');
    expect(berlinLokalZuIso('2026-03-29T12:00')).toBe('2026-03-29T10:00:00.000Z');
  });
  it('reines Datum = 00:00 Uhr, Tagesende = 23:59 Uhr', () => {
    expect(berlinLokalZuIso('2026-07-01')).toBe('2026-06-30T22:00:00.000Z');
    expect(berlinTagesendeZuIso('2026-07-01')).toBe('2026-07-01T21:59:00.000Z');
  });
  it('lehnt Unsinn ab', () => {
    expect(berlinLokalZuIso('morgen')).toBeUndefined();
    expect(berlinLokalZuIso(undefined)).toBeUndefined();
    expect(berlinTagesendeZuIso('2026-7-1')).toBeUndefined();
  });
  it('rechnet zurück für Formular-Vorgaben', () => {
    expect(isoZuBerlinLokal('2026-07-01T08:00:00.000Z')).toBe('2026-07-01T10:00');
    expect(isoZuBerlinLokal('2026-06-30T22:30:00.000Z', true)).toBe('2026-07-01');
  });
});

describe('Feldwerte', () => {
  it('liest Text, Haken und Beträge (mit deutschem Komma)', () => {
    const f = fd({ a: '  x ', leer: '  ', h: 'on', b: '1.234,50', c: '119.5', kaputt: 'zwölf' });
    expect(text(f, 'a')).toBe('x');
    expect(text(f, 'leer')).toBeUndefined();
    expect(haken(f, 'h')).toBe(true);
    expect(haken(f, 'fehlt')).toBe(false);
    expect(betrag(f, 'b')).toBe(1234.5);
    expect(betrag(f, 'c')).toBe(119.5);
    expect(betrag(f, 'kaputt')).toBe('zwölf');
  });
  it('übernimmt nur echte Formularfelder', () => {
    const f = fd({ name: 'A', $ACTION_ID_123: 'x' });
    expect(werteAus(f)).toEqual({ name: 'A' });
  });
});

describe('Fehler und Folgestatus', () => {
  it('ordnet die erste Meldung je Feld zu', () => {
    expect(
      feldFehlerAus({
        issues: [
          { path: ['kennzeichen'], message: 'Kennzeichen fehlt' },
          { path: ['kennzeichen'], message: 'zweite' },
          { path: ['aggregat', 'sensoren', 0, 'einheit'], message: 'Pflichtfeld' },
        ],
      }),
    ).toEqual({ kennzeichen: 'Kennzeichen fehlt', 'aggregat.sensoren.0.einheit': 'Pflichtfeld' });
  });
  it('liefert nur erlaubte Folgestatus', () => {
    expect(naechsteStatus(KUNDE_STATUS, 'in_pruefung', istKundeUebergangErlaubt)).toEqual([
      'freigegeben',
      'abgelehnt',
    ]);
    expect(naechsteStatus(KUNDE_STATUS, 'abgelehnt', istKundeUebergangErlaubt)).toEqual([]);
    expect(naechsteStatus(KUNDE_STATUS, 'gibtsnicht', istKundeUebergangErlaubt)).toEqual([]);
  });
});
