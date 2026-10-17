import { describe, expect, it } from 'vitest';
import type { TemperaturNachweis } from '@rent2cool/shared';
import { JsonNachweisRenderer, RendererRegistry } from './renderer';

const nachweis = {
  schemaVersion: 1,
  fahrzeugId: 'f1',
  messgroesse: 'temperatur_laderaum',
  von: '2026-10-16T08:00:00.000Z',
  bis: '2026-10-16T09:00:00.000Z',
  erzeugtAm: '2026-10-16T09:00:01.000Z',
  profil: { name: '2-8', minC: 2, maxC: 8 },
  kennzahlen: { anzahl: 1, minC: 5, maxC: 5, mittelC: 5, ersteMessung: null, letzteMessung: null },
  grenzverletzungen: [],
  luecken: [],
  bewertung: 'eingehalten',
  integritaet: { algorithmus: 'HMAC-SHA256', datenHash: 'abc', signatur: 'def' },
} as unknown as TemperaturNachweis;

describe('JsonNachweisRenderer', () => {
  it('rendert gültiges JSON mit passendem Content-Type', () => {
    const r = new JsonNachweisRenderer();
    expect(r.contentType).toBe('application/json');
    const buf = r.render(nachweis);
    expect(JSON.parse(buf.toString('utf8'))).toMatchObject({
      fahrzeugId: 'f1',
      bewertung: 'eingehalten',
    });
  });
});

describe('RendererRegistry', () => {
  it('findet registrierte Formate und meldet Unbekanntes als undefined', () => {
    const reg = new RendererRegistry([new JsonNachweisRenderer()]);
    expect(reg.formate()).toContain('json');
    expect(reg.hole('json')).toBeDefined();
    expect(reg.hole('pdf')).toBeUndefined();
  });
});
