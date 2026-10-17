import { describe, expect, it } from 'vitest';
import {
  formatDatumZeit,
  formatEuro,
  formatTemperatur,
  kurzeId,
  statusLabel,
  statusTon,
} from './format';

describe('Formatierung', () => {
  it('zeigt UTC-Zeitpunkte in deutscher Ortszeit', () => {
    // 08:00 UTC im Oktober = 10:00 MESZ
    expect(formatDatumZeit('2026-10-16T08:00:00Z')).toContain('10:00');
  });

  it('liefert Gedankenstrich bei fehlendem/ungültigem Datum', () => {
    expect(formatDatumZeit(null)).toBe('–');
    expect(formatDatumZeit('kein-datum')).toBe('–');
  });

  it('formatiert Cent als Euro', () => {
    expect(formatEuro(11900)).toMatch(/119,00\s?€/);
    expect(formatEuro(null)).toBe('–');
  });

  it('formatiert Temperaturen mit einer Nachkommastelle', () => {
    expect(formatTemperatur(5)).toBe('5,0 °C');
    expect(formatTemperatur(undefined)).toBe('–');
  });

  it('kürzt IDs', () => {
    expect(kurzeId('018f3a2b-7c4d-7e2a-9b1c-2f3a4b5c6d7e')).toBe('018f3a2b');
  });

  it('ordnet Status einen Ton und ein lesbares Label zu', () => {
    expect(statusTon('verfuegbar')).toBe('ok');
    expect(statusTon('offen')).toBe('kritisch');
    expect(statusTon('unbekannt')).toBe('neutral');
    expect(statusLabel('ausser_betrieb')).toBe('außer Betrieb');
    expect(statusLabel('temperatur_ueber')).toBe('Temperatur zu hoch');
    expect(statusLabel('irgend_was')).toBe('irgend was');
  });
});
