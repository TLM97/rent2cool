import { describe, expect, it } from 'vitest';
import { verdichteKurve, type KurvenPunkt } from './bericht';

const punkte = (n: number, wert: (i: number) => number): KurvenPunkt[] =>
  Array.from({ length: n }, (_, i) => ({
    zeit: new Date(Date.UTC(2026, 9, 17, 0, i)).toISOString(),
    wert: wert(i),
  }));

describe('Kurve verdichten', () => {
  it('kleine Reihen bleiben unverändert', () => {
    const p = punkte(50, () => 5);
    expect(verdichteKurve(p, 40)).toEqual(p);
  });

  it('kurze Spitzen bleiben sichtbar, Reihenfolge bleibt zeitlich', () => {
    // 10.000 Messpunkte bei 5 °C, eine einzelne Spitze 9,1 °C und ein Tief 1,5 °C.
    const p = punkte(10_000, (i) => (i === 4321 ? 9.1 : i === 777 ? 1.5 : 5));
    const v = verdichteKurve(p, 200);
    expect(v.length).toBeLessThanOrEqual(400);
    expect(Math.max(...v.map((x) => x.wert))).toBe(9.1);
    expect(Math.min(...v.map((x) => x.wert))).toBe(1.5);
    const zeiten = v.map((x) => x.zeit);
    expect([...zeiten].sort()).toEqual(zeiten);
  });
});
