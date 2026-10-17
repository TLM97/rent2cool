import { describe, expect, it } from 'vitest';
import { adresse, oeffnungKurz } from './anzeige';

describe('Standort-Anzeige', () => {
  it('Öffnung kurz', () => {
    expect(oeffnungKurz(null)).toBe('rund um die Uhr');
    expect(oeffnungKurz({ zeitzone: 'Europe/Berlin', woche: {} })).toBe('geschlossen');
    expect(
      oeffnungKurz({
        zeitzone: 'Europe/Berlin',
        woche: {
          mo: [{ von: '06:00', bis: '22:00' }],
          sa: [{ von: '08:00', bis: '14:00' }],
          so: [],
        },
      }),
    ).toBe('Mo, Sa');
  });
  it('Adresse ohne leere Teile', () => {
    expect(adresse({ strasse: 'Kühlweg 1', plz: '12345', ort: 'Musterstadt', land: 'DE' })).toBe(
      'Kühlweg 1, 12345 Musterstadt, DE',
    );
    expect(adresse({ strasse: null, plz: null, ort: null, land: 'DE' })).toBe('DE');
  });
});
