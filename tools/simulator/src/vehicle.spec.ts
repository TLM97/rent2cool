import { describe, expect, it } from 'vitest';
import { erzeugeFlotte, PROFILE, VirtualVehicle } from './vehicle';

describe('VirtualVehicle', () => {
  it('erzeugt ~10 Messwerte mit eindeutiger Nachrichten-ID', () => {
    const v = new VirtualVehicle({
      fahrzeugId: '018f3a2b-7c4d-7e2a-9b1c-2f3a4b5c6d7e',
      profil: PROFILE[0]!,
      tuerRate: 0,
      ausreisserRate: 0,
    });
    const a = v.erzeuge(new Date('2026-10-16T08:00:00Z'));
    const b = v.erzeuge(new Date('2026-10-16T08:01:00Z'));
    expect(a.messwerte.length).toBe(10);
    expect(a.nachrichtId).not.toBe(b.nachrichtId);
    expect(a.quelle).toBe('simulator');
  });

  it('hält die Temperatur ohne Ausreißer im Profilband', () => {
    const profil = PROFILE[0]!; // 2-8
    const v = new VirtualVehicle({
      fahrzeugId: '018f3a2b-7c4d-7e2a-9b1c-2f3a4b5c6d7e',
      profil,
      tuerRate: 0,
      ausreisserRate: 0,
    });
    for (let i = 0; i < 200; i++) {
      const n = v.erzeuge(new Date());
      const temp = n.messwerte.find((m) => m.messgroesse === 'temperatur_laderaum')!.wert;
      expect(temp).toBeGreaterThanOrEqual(profil.minC);
      expect(temp).toBeLessThanOrEqual(profil.maxC);
    }
  });

  it('erzeugt die gewünschte Flottengröße mit gemischten Profilen', () => {
    const flotte = erzeugeFlotte(4, { tuerRate: 0, ausreisserRate: 0 });
    expect(flotte).toHaveLength(4);
  });
});
