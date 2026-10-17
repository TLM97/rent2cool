import { describe, expect, it } from 'vitest';
import { BEFEHL_OPTIONEN, befehlDetail, befehlVon, schluesselGueltigkeit } from './schluessel';

describe('Schlüssel und Befehle', () => {
  it('Auswahl aller Befehle in fester Reihenfolge', () => {
    expect(BEFEHL_OPTIONEN.map((k) => k.text)).toEqual([
      'Entriegeln',
      'Verriegeln',
      'Wegfahrsperre ein',
      'Wegfahrsperre aus',
    ]);
  });

  it('Auslöser: Fahrer mit Schlüssel oder Betrieb', () => {
    expect(befehlVon({ schluesselId: 's1', fahrerName: 'Erika (Demo)' })).toBe(
      'Fahrer Erika (Demo) (Schlüssel)',
    );
    expect(befehlVon({ schluesselId: null, fahrerName: null })).toBe('Betrieb');
  });

  it('Details: Grund und Ablehnungsgründe', () => {
    expect(befehlDetail({ grund: 'Fahrer ausgesperrt', gruende: null })).toBe('Fahrer ausgesperrt');
    expect(
      befehlDetail({ grund: null, gruende: ['Schlüssel ist widerrufen', 'Miete beendet'] }),
    ).toBe('Schlüssel ist widerrufen · Miete beendet');
  });

  it('Gültigkeit', () => {
    expect(schluesselGueltigkeit({ status: 'aktiv', gueltigBis: null, widerrufGrund: null })).toBe(
      'bis Mietende',
    );
    expect(
      schluesselGueltigkeit({
        status: 'widerrufen',
        gueltigBis: null,
        widerrufGrund: 'Miete beendet',
      }),
    ).toBe('widerrufen – Miete beendet');
  });
});
