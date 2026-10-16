import { describe, expect, it } from 'vitest';
import type { Temperaturprofil } from '@rent2cool/shared';
import { berechneNachweis, type Messpunkt, type NachweisParams } from './nachweis';
import { HmacSignierer } from './signierer';

const profil: Temperaturprofil = { name: '2-8', minC: 2, maxC: 8 };
const signierer = new HmacSignierer('test-schluessel');

function params(over: Partial<NachweisParams> = {}): NachweisParams {
  return {
    fahrzeugId: '018f3a2b-7c4d-7e2a-9b1c-2f3a4b5c6d7e',
    messgroesse: 'temperatur_laderaum',
    von: '2026-10-16T08:00:00.000Z',
    bis: '2026-10-16T09:00:00.000Z',
    profil,
    lueckeSchwelleMin: 5,
    ...over,
  };
}

function punkt(min: number, wert: number): Messpunkt {
  return { zeit: new Date(Date.UTC(2026, 9, 16, 8, min, 0)).toISOString(), wert };
}

describe('berechneNachweis', () => {
  it('bewertet eine lückenlose Reihe im Band als eingehalten', () => {
    const punkte = [punkt(0, 4), punkt(1, 5), punkt(2, 6)];
    const n = berechneNachweis(punkte, params(), signierer);
    expect(n.bewertung).toBe('eingehalten');
    expect(n.kennzahlen).toMatchObject({ anzahl: 3, minC: 4, maxC: 6, mittelC: 5 });
    expect(n.grenzverletzungen).toHaveLength(0);
    expect(n.luecken).toHaveLength(0);
  });

  it('erkennt Grenzverletzungen (über/unter)', () => {
    const punkte = [punkt(0, 5), punkt(1, 9.5), punkt(2, 1)];
    const n = berechneNachweis(punkte, params(), signierer);
    expect(n.bewertung).toBe('verletzt');
    expect(n.grenzverletzungen).toEqual([
      expect.objectContaining({ art: 'ueber', wert: 9.5 }),
      expect.objectContaining({ art: 'unter', wert: 1 }),
    ]);
  });

  it('erkennt Lücken (Funklöcher) oberhalb der Schwelle', () => {
    const punkte = [punkt(0, 5), punkt(1, 5), punkt(30, 5)]; // 29 min Lücke
    const n = berechneNachweis(punkte, params(), signierer);
    expect(n.bewertung).toBe('unvollstaendig');
    expect(n.luecken).toHaveLength(1);
    expect(n.luecken[0]!.dauerMin).toBe(29);
  });

  it('leere Reihe ist unvollständig', () => {
    const n = berechneNachweis([], params(), signierer);
    expect(n.bewertung).toBe('unvollstaendig');
    expect(n.kennzahlen.anzahl).toBe(0);
    expect(n.kennzahlen.minC).toBeNull();
  });

  it('signiert reproduzierbar; Manipulation ändert den Hash', () => {
    const a = berechneNachweis([punkt(0, 5)], params(), signierer);
    const b = berechneNachweis([punkt(0, 5)], params(), signierer);
    const c = berechneNachweis([punkt(0, 6)], params(), signierer);
    expect(a.integritaet.datenHash).toBe(b.integritaet.datenHash);
    expect(a.integritaet.signatur).toBe(b.integritaet.signatur);
    expect(a.integritaet.datenHash).not.toBe(c.integritaet.datenHash);
  });
});
