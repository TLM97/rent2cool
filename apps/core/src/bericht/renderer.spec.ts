import { describe, expect, it } from 'vitest';
import type { NachweisDokument, TemperaturNachweis } from '@rent2cool/shared';
import { PdfNachweisRenderer, zuEreignissen } from './pdf-renderer';
import { JsonNachweisRenderer, RendererRegistry, standardRenderer } from './renderer';

const nachweis = {
  schemaVersion: 1,
  fahrzeugId: 'f1',
  messgroesse: 'temperatur_laderaum',
  von: '2026-10-16T08:00:00.000Z',
  bis: '2026-10-16T09:00:00.000Z',
  erzeugtAm: '2026-10-16T09:00:01.000Z',
  profil: { name: '2-8', minC: 2, maxC: 8 },
  kennzahlen: {
    anzahl: 3,
    minC: 5,
    maxC: 9.1,
    mittelC: 6,
    ersteMessung: null,
    letzteMessung: null,
  },
  grenzverletzungen: [{ zeit: '2026-10-16T08:30:00.000Z', wert: 9.1, art: 'ueber' }],
  luecken: [],
  bewertung: 'verletzt',
  integritaet: { algorithmus: 'HMAC-SHA256', datenHash: 'abc', signatur: 'def' },
} as unknown as TemperaturNachweis;

const dokument: NachweisDokument = {
  schemaVersion: 1,
  titel: 'Temperaturnachweis',
  version: 1,
  ausloeser: 'automatisch',
  miete: {
    mieteId: 'm1',
    kunde: 'Testkunde (Demo)',
    kennzeichen: 'DEMO-1',
    startIst: '2026-10-16T08:00:00.000Z',
    endeIst: '2026-10-16T09:00:00.000Z',
  },
  nachweis,
  siegel: { art: 'testsiegel', aussteller: 'Rent2Cool Testsiegel (PLACEHOLDER)' },
  kurve: [
    { zeit: '2026-10-16T08:00:00.000Z', wert: 5 },
    { zeit: '2026-10-16T08:30:00.000Z', wert: 9.1 },
    { zeit: '2026-10-16T09:00:00.000Z', wert: 5.5 },
  ],
};

describe('JsonNachweisRenderer', () => {
  it('rendert das Dokument als JSON mit passendem Content-Type', async () => {
    const r = new JsonNachweisRenderer();
    expect(r.contentType).toBe('application/json');
    const buf = await r.render(dokument);
    expect(JSON.parse(buf.toString('utf8'))).toMatchObject({
      miete: { mieteId: 'm1' },
      nachweis: { fahrzeugId: 'f1', bewertung: 'verletzt' },
    });
  });
});

describe('PdfNachweisRenderer', () => {
  it('erzeugt ein PDF; gleiche Eingabe → gleiche Datei (reproduzierbar)', async () => {
    const r = new PdfNachweisRenderer();
    const a = await r.render(dokument);
    expect(a.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(a.length).toBeGreaterThan(1500);
    expect((await r.render(dokument)).equals(a)).toBe(true);
    // Eine Seite bei wenigen Ereignissen (keine leeren Zusatzseiten durch die Fußzeile).
    expect(a.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
    // Ohne Miete (Fahrzeug und Zeitraum) ebenfalls
    const ohne = await r.render({ ...dokument, miete: null, kurve: [] });
    expect(ohne.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});

describe('Grenzverletzungen als Ereignisse', () => {
  it('fasst aufeinanderfolgende Werte zusammen, trennt nach Pause und Art', () => {
    const z = (min: number) => new Date(Date.UTC(2026, 9, 14, 4, min)).toISOString();
    const e = zuEreignissen([
      { zeit: z(22), wert: 8.2, art: 'ueber' },
      { zeit: z(23), wert: 10.1, art: 'ueber' },
      { zeit: z(24), wert: 9, art: 'ueber' },
      { zeit: z(40), wert: 8.4, art: 'ueber' },
      { zeit: z(41), wert: 1.5, art: 'unter' },
      { zeit: z(42), wert: 1.2, art: 'unter' },
    ]);
    expect(e).toEqual([
      { von: z(22), bis: z(24), art: 'ueber', anzahl: 3, spitze: 10.1 },
      { von: z(40), bis: z(40), art: 'ueber', anzahl: 1, spitze: 8.4 },
      { von: z(41), bis: z(42), art: 'unter', anzahl: 2, spitze: 1.2 },
    ]);
  });
});

describe('RendererRegistry', () => {
  it('findet registrierte Formate und meldet Unbekanntes als undefined', () => {
    const reg = new RendererRegistry([new JsonNachweisRenderer()]);
    expect(reg.formate()).toContain('json');
    expect(reg.hole('json')).toBeDefined();
    expect(reg.hole('csv')).toBeUndefined();
    expect(standardRenderer().formate()).toEqual(['json', 'pdf']);
  });
});
