import { describe, expect, it } from 'vitest';
import { bewerteBuchbarkeit } from './fristen';

const jetzt = new Date('2026-10-16T12:00:00Z');
const zukunft = new Date('2027-01-01T00:00:00Z');
const vergangenheit = new Date('2026-01-01T00:00:00Z');

describe('bewerteBuchbarkeit', () => {
  it('buchbar bei verfuegbar und gültiger Kalibrierung', () => {
    const r = bewerteBuchbarkeit('verfuegbar', [{ sensorId: 's1', gueltigBis: zukunft }], jetzt);
    expect(r.buchbar).toBe(true);
    expect(r.gruende).toEqual([]);
  });

  it('nicht buchbar bei abgelaufener Kalibrierung', () => {
    const r = bewerteBuchbarkeit('verfuegbar', [{ sensorId: 's1', gueltigBis: vergangenheit }], jetzt);
    expect(r.buchbar).toBe(false);
    expect(r.gruende[0]).toContain('abgelaufen');
  });

  it('nicht buchbar bei falschem Status', () => {
    const r = bewerteBuchbarkeit('wartung', [{ sensorId: 's1', gueltigBis: zukunft }], jetzt);
    expect(r.buchbar).toBe(false);
    expect(r.gruende[0]).toContain('wartung');
  });

  it('nicht buchbar ohne Sensor', () => {
    expect(bewerteBuchbarkeit('verfuegbar', [], jetzt).buchbar).toBe(false);
  });

  it('nicht buchbar ohne Kalibrierung', () => {
    const r = bewerteBuchbarkeit('verfuegbar', [{ sensorId: 's1', gueltigBis: null }], jetzt);
    expect(r.buchbar).toBe(false);
    expect(r.gruende[0]).toContain('keine Kalibrierung');
  });
});
