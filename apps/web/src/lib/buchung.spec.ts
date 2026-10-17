import { describe, expect, it } from 'vitest';
import { kannStornieren, zeitraumAus } from './buchung';

describe('Buchung im Portal', () => {
  it('Standard: ab nächster voller Stunde für 24 h, in Ortszeit, UTC für den Kern', () => {
    // 17.10.2026 10:20 UTC = 12:20 Berlin (Sommerzeit)
    const z = zeitraumAus({}, Date.UTC(2026, 9, 17, 10, 20));
    expect(z).toMatchObject({
      start: '2026-10-17T13:00',
      ende: '2026-10-18T13:00',
      vonIso: '2026-10-17T11:00:00.000Z',
      bisIso: '2026-10-18T11:00:00.000Z',
      ok: true,
    });
  });

  it('Ende vor Start oder Unsinn ist ungültig', () => {
    expect(zeitraumAus({ start: '2026-10-20T10:00', ende: '2026-10-20T09:00' }).ok).toBe(false);
    expect(zeitraumAus({ start: 'gestern', ende: '2026-10-20T09:00' }).ok).toBe(false);
  });

  it('Winterzeit wird richtig umgerechnet', () => {
    const z = zeitraumAus({ start: '2026-12-01T08:00', ende: '2026-12-02T08:00' });
    expect(z.vonIso).toBe('2026-12-01T07:00:00.000Z');
  });

  it('stornieren nur vor Mietbeginn', () => {
    expect(kannStornieren('bestaetigt')).toBe(true);
    expect(kannStornieren('angefragt')).toBe(true);
    expect(kannStornieren('aktiv')).toBe(false);
    expect(kannStornieren('storniert')).toBe(false);
  });
});
