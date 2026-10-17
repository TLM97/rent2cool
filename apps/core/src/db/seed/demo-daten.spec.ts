import { describe, expect, it } from 'vitest';
import { findeAlarmKandidaten, STANDARD_TEMPERATURPROFILE } from '@rent2cool/shared';
import {
  DEMO_FAHRZEUGE,
  DEMO_KUNDEN,
  DEMO_MIETEN,
  relativ,
  temperaturVerlauf,
  zufall,
} from './demo-daten';

const PROFIL_2_8 = STANDARD_TEMPERATURPROFILE.find((p) => p.name === '2-8')!;
const FZ = '018f3a2b-7c4d-7e2a-9b1c-2f3a4b5c6d7e';
const von = new Date('2026-10-10T06:00:00.000Z');

describe('Demo-Daten', () => {
  it('sind erkennbar erfunden (D-015)', () => {
    expect(DEMO_KUNDEN.every((k) => k.firmenname.endsWith('(Demo)'))).toBe(true);
    expect(DEMO_FAHRZEUGE.every((f) => f.kennzeichen.startsWith('DEMO-'))).toBe(true);
  });

  it('Szenarien verweisen auf vorhandene Fahrzeuge, Kunden und Fahrer; keine Überschneidung je Fahrzeug', () => {
    for (const m of DEMO_MIETEN) {
      expect(DEMO_FAHRZEUGE.some((f) => f.schluessel === m.fahrzeug)).toBe(true);
      const kunde = DEMO_KUNDEN.find((k) => k.schluessel === m.kunde);
      expect(kunde?.status).toBe('freigegeben');
      expect(kunde?.fahrer[m.fahrer]).toBeDefined();
      for (const n of DEMO_MIETEN) {
        if (n !== m && n.fahrzeug === m.fahrzeug) {
          expect(n.startStunden >= m.endeStunden || n.endeStunden <= m.startStunden).toBe(true);
        }
      }
    }
  });

  it('Temperaturverlauf: ein Wert je Minute, 10 je Nachricht, stabile IDs, im Profil', () => {
    const bis = new Date(von.getTime() + 2 * 3_600_000);
    const n = temperaturVerlauf({ fahrzeugId: FZ, von, bis, profil: PROFIL_2_8, saat: 1 });
    expect(n).toHaveLength(12);
    expect(n.flatMap((x) => x.messwerte)).toHaveLength(120);
    expect(n.every((x) => x.messwerte.length === 10)).toBe(true);
    expect(new Set(n.map((x) => x.nachrichtId)).size).toBe(12);
    expect(n.flatMap((x) => findeAlarmKandidaten(x.messwerte, PROFIL_2_8))).toEqual([]);
    // Reproduzierbar
    expect(temperaturVerlauf({ fahrzeugId: FZ, von, bis, profil: PROFIL_2_8, saat: 1 })).toEqual(n);
  });

  it('Ausreißer erzeugt Alarm-Kandidaten nur in seinem Zeitfenster', () => {
    const bis = new Date(von.getTime() + 3 * 3_600_000);
    const n = temperaturVerlauf({
      fahrzeugId: FZ,
      von,
      bis,
      profil: PROFIL_2_8,
      saat: 2,
      ausreisser: { abStunde: 1, dauerMin: 30, spitzeC: 9.6 },
    });
    const ueber = n.flatMap((x) => x.messwerte).filter((w) => w.wert > PROFIL_2_8.maxC);
    expect(ueber.length).toBeGreaterThan(0);
    expect(Math.max(...ueber.map((w) => w.wert))).toBeLessThanOrEqual(9.6 + 0.8);
    for (const w of ueber) {
      const t = new Date(w.zeit!).getTime() - von.getTime();
      expect(t).toBeGreaterThanOrEqual(3_600_000);
      expect(t).toBeLessThan(3_600_000 + 30 * 60_000);
    }
  });

  it('Hilfsfunktionen: Zufall reproduzierbar, Zeiten auf Viertelstunden', () => {
    expect(zufall(7)()).toBe(zufall(7)());
    expect(relativ(new Date('2026-10-17T10:07:00Z'), -1).toISOString()).toBe(
      '2026-10-17T09:00:00.000Z',
    );
  });
});
