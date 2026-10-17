import { describe, expect, it } from 'vitest';
import {
  baueHuelle,
  pruefeSignatur,
  validierePayloadUndSignatur,
  type TelemetrieNachricht,
} from './telemetry';

const SCHLUESSEL = 'test-platzhalter-schluessel';

function beispielNachricht(): TelemetrieNachricht {
  return {
    nachrichtId: 'nachricht-0001-abcdef',
    fahrzeugId: '018f3a2b-7c4d-7e2a-9b1c-2f3a4b5c6d7e',
    quelle: 'simulator',
    gesendetAm: '2026-10-16T08:00:00.000Z',
    messwerte: [
      { messgroesse: 'temperatur_laderaum', wert: 5.2, einheit: 'C' },
      { messgroesse: 'tuer_offen', wert: 0, einheit: 'bool' },
    ],
  };
}

describe('Telematik-Format und Signatur', () => {
  it('signiert und verifiziert eine Hülle (Roundtrip)', () => {
    const huelle = baueHuelle(beispielNachricht(), SCHLUESSEL);
    expect(huelle.alg).toBe('HMAC-SHA256');
    expect(pruefeSignatur(huelle, SCHLUESSEL)).toBe(true);
  });

  it('lehnt eine verfälschte Payload ab', () => {
    const huelle = baueHuelle(beispielNachricht(), SCHLUESSEL);
    const manipuliert = { ...huelle, payload: huelle.payload.replace('5.2', '99') };
    expect(pruefeSignatur(manipuliert, SCHLUESSEL)).toBe(false);
  });

  it('lehnt falschen Schlüssel ab', () => {
    const huelle = baueHuelle(beispielNachricht(), SCHLUESSEL);
    expect(pruefeSignatur(huelle, 'anderer-schluessel')).toBe(false);
  });

  it('validiert Format und Signatur zusammen und gibt die Nachricht zurück', () => {
    const huelle = baueHuelle(beispielNachricht(), SCHLUESSEL);
    const ergebnis = validierePayloadUndSignatur(huelle, SCHLUESSEL);
    expect(ergebnis.ok).toBe(true);
    if (ergebnis.ok) {
      expect(ergebnis.nachricht.nachrichtId).toBe('nachricht-0001-abcdef');
      expect(ergebnis.nachricht.messwerte).toHaveLength(2);
    }
  });

  it('meldet signatur-Fehler bei falscher Signatur', () => {
    const huelle = baueHuelle(beispielNachricht(), SCHLUESSEL);
    const ergebnis = validierePayloadUndSignatur({ ...huelle, signatur: 'deadbeef' }, SCHLUESSEL);
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) {
      expect(ergebnis.grund).toBe('signatur');
    }
  });

  it('meldet format-Fehler bei kaputter Hülle', () => {
    const ergebnis = validierePayloadUndSignatur({ payload: 123 }, SCHLUESSEL);
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) {
      expect(ergebnis.grund).toBe('format');
    }
  });
});
