import { describe, expect, it } from 'vitest';
import {
  findeAlarmKandidaten,
  istAbweichungUebergangErlaubt,
  istAlarmUebergangErlaubt,
} from './alarm';
import type { TelemetrieWert } from './telemetry';

const profil = { name: '2-8', minC: 2, maxC: 8 };

describe('Alarm-/Abweichung-Statusmodelle', () => {
  it('Alarm-Übergänge', () => {
    expect(istAlarmUebergangErlaubt('offen', 'quittiert')).toBe(true);
    expect(istAlarmUebergangErlaubt('quittiert', 'geschlossen')).toBe(true);
    expect(istAlarmUebergangErlaubt('geschlossen', 'offen')).toBe(false);
  });
  it('Abweichung-Übergänge', () => {
    expect(istAbweichungUebergangErlaubt('erfasst', 'in_bewertung')).toBe(true);
    expect(istAbweichungUebergangErlaubt('bewertet', 'geschlossen')).toBe(true);
    expect(istAbweichungUebergangErlaubt('erfasst', 'geschlossen')).toBe(false);
  });
});

describe('findeAlarmKandidaten', () => {
  const w = (messgroesse: string, wert: number): TelemetrieWert => ({ messgroesse, wert, einheit: 'x' });

  it('meldet Temperatur über der Grenze', () => {
    const k = findeAlarmKandidaten([w('temperatur_laderaum', 9.5)], profil);
    expect(k).toEqual([expect.objectContaining({ typ: 'temperatur_ueber', schwelle: 8, wert: 9.5 })]);
  });
  it('meldet Temperatur unter der Grenze', () => {
    const k = findeAlarmKandidaten([w('temperatur_laderaum', 1)], profil);
    expect(k[0]!.typ).toBe('temperatur_unter');
  });
  it('meldet offene Tür', () => {
    const k = findeAlarmKandidaten([w('tuer_offen', 1)], profil);
    expect(k[0]!.typ).toBe('tuer_offen');
  });
  it('meldet nichts im Normalbereich', () => {
    const k = findeAlarmKandidaten([w('temperatur_laderaum', 5), w('tuer_offen', 0)], profil);
    expect(k).toHaveLength(0);
  });
});
