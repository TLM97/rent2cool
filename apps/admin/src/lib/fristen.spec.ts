import { describe, expect, it } from 'vitest';
import { fuehrerscheinFrist, kalibrierungFrist } from './fristen';

const jetzt = Date.UTC(2026, 9, 16, 12, 0, 0);
const inTagen = (t: number) => new Date(jetzt + t * 86_400_000).toISOString();

describe('fuehrerscheinFrist', () => {
  it('gültig bei weit entferntem Ablauf', () => {
    expect(fuehrerscheinFrist(inTagen(200), jetzt)).toEqual({ text: 'gültig', ton: 'ok' });
  });
  it('Warnung innerhalb von 30 Tagen', () => {
    expect(fuehrerscheinFrist(inTagen(10), jetzt)).toEqual({
      text: 'läuft in 10 T. ab',
      ton: 'warn',
    });
  });
  it('kritisch, wenn abgelaufen oder ohne Datum', () => {
    expect(fuehrerscheinFrist(inTagen(-1), jetzt).ton).toBe('kritisch');
    expect(fuehrerscheinFrist(null, jetzt).text).toBe('kein Datum');
  });
});

describe('kalibrierungFrist', () => {
  it('meldet fehlende Kalibrierung und nahe Fristen', () => {
    expect(kalibrierungFrist(null, jetzt)).toEqual({ text: 'nicht kalibriert', ton: 'kritisch' });
    expect(kalibrierungFrist(inTagen(5), jetzt).ton).toBe('warn');
    expect(kalibrierungFrist(inTagen(365), jetzt).text).toBe('gültig');
  });
});
