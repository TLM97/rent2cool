import { describe, expect, it } from 'vitest';
import {
  fahrzeugBefehlSchema,
  pruefeSchluesselBefehl,
  schluesselAusstellbar,
  schluesselBefehlSchema,
  schluesselGueltigAb,
} from './schluessel';

const jetzt = new Date('2026-10-17T12:00:00Z');
const gueltig = { status: 'aktiv', gueltigVon: new Date('2026-10-17T10:00:00Z'), gueltigBis: null };

describe('Digitaler Schlüssel', () => {
  it('gilt ab einer Stunde vor dem geplanten Mietbeginn', () => {
    expect(schluesselGueltigAb(new Date('2026-10-17T08:00:00Z')).toISOString()).toBe(
      '2026-10-17T07:00:00.000Z',
    );
  });

  it('ausstellbar nur für bestätigte oder aktive Mieten', () => {
    expect(schluesselAusstellbar('bestaetigt')).toEqual([]);
    expect(schluesselAusstellbar('aktiv')).toEqual([]);
    expect(schluesselAusstellbar('beendet')).toEqual([
      'Miete ist nicht bestätigt oder aktiv (Status beendet)',
    ]);
  });

  it('Fahrer darf mit gültigem Schlüssel ent- und verriegeln', () => {
    for (const befehl of ['entriegeln', 'verriegeln'] as const) {
      expect(
        pruefeSchluesselBefehl({ schluessel: gueltig, mieteStatus: 'aktiv', befehl, jetzt }),
      ).toEqual([]);
    }
  });

  it('Wegfahrsperre nur durch Ops, nicht mit dem Fahrerschlüssel', () => {
    expect(
      pruefeSchluesselBefehl({
        schluessel: gueltig,
        mieteStatus: 'aktiv',
        befehl: 'wegfahrsperre_aus',
        jetzt,
      }),
    ).toEqual(['Wegfahrsperre aus ist mit dem Fahrerschlüssel nicht erlaubt']);
  });

  it('sammelt alle Gründe: widerrufen, zu früh, abgelaufen, Miete beendet', () => {
    expect(
      pruefeSchluesselBefehl({
        schluessel: { ...gueltig, status: 'widerrufen' },
        mieteStatus: 'beendet',
        befehl: 'entriegeln',
        jetzt,
      }),
    ).toEqual([
      'Schlüssel ist widerrufen',
      'Miete ist nicht bestätigt oder aktiv (Status beendet)',
    ]);
    expect(
      pruefeSchluesselBefehl({
        schluessel: { ...gueltig, gueltigVon: new Date('2026-10-17T13:00:00Z') },
        mieteStatus: 'bestaetigt',
        befehl: 'entriegeln',
        jetzt,
      }),
    ).toEqual(['Schlüssel gilt erst ab 2026-10-17T13:00:00.000Z']);
    expect(
      pruefeSchluesselBefehl({
        schluessel: { ...gueltig, gueltigBis: new Date('2026-10-17T11:59:00Z') },
        mieteStatus: 'aktiv',
        befehl: 'verriegeln',
        jetzt,
      }),
    ).toEqual(['Schlüssel ist abgelaufen']);
  });

  it('Eingaben: Befehl bekannt, Idempotency-Key Pflicht, Ops nur mit Grund', () => {
    expect(schluesselBefehlSchema.safeParse({ befehl: 'entriegeln' }).success).toBe(false);
    expect(
      schluesselBefehlSchema.safeParse({ befehl: 'hupen', idempotencyKey: 'k1' }).success,
    ).toBe(false);
    expect(
      schluesselBefehlSchema.safeParse({ befehl: 'entriegeln', idempotencyKey: 'k1' }).success,
    ).toBe(true);
    expect(
      fahrzeugBefehlSchema.safeParse({
        befehl: 'wegfahrsperre_ein',
        grund: ' ',
        idempotencyKey: 'k2',
      }).success,
    ).toBe(false);
  });
});
