import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Principal } from '@rent2cool/shared';
import type { Database } from '../db/client';
import { wechsleStatus, type StatusWechsel } from './statuswechsel';

type S = 'a' | 'b' | 'c';
const ERLAUBT: Record<S, S[]> = { a: ['b'], b: ['c'], c: [] };
const principal: Principal = { akteurId: 'u1', rollen: ['ops'], mandantId: 'm1' };

/** Fake-Datenbank: Transaktion ruft direkt auf, Audit-Inserts werden gesammelt. */
function fakeDb() {
  const audit: Record<string, unknown>[] = [];
  const tx = {
    insert: () => ({ values: async (v: Record<string, unknown>) => void audit.push(v) }),
  };
  const db = { transaction: async (fn: (t: unknown) => unknown) => fn(tx) } as unknown as Database;
  return { db, audit };
}

function optionen(vorher: { status: string; seit?: string | null } | undefined, nach: S) {
  const speichere = vi.fn(async () => {});
  const danach = vi.fn(async () => {});
  const o: StatusWechsel<S, { status: string; seit?: string | null }> = {
    entitaetTyp: 'test_status',
    id: 'x1',
    nach,
    nichtGefunden: 'Nicht da',
    lade: async () => vorher,
    istStatus: (s): s is S => s === 'a' || s === 'b' || s === 'c',
    erlaubt: (von, n) => ERLAUBT[von].includes(n),
    zusatz: (v) => (nach === 'b' && !v.seit ? { seit: '2026-10-17T08:00:00.000Z' } : {}),
    speichere,
    danach,
  };
  return { o, speichere, danach };
}

describe('wechsleStatus', () => {
  it('speichert nur Geändertes und protokolliert alten und neuen Wert', async () => {
    const { db, audit } = fakeDb();
    const { o, speichere, danach } = optionen({ status: 'a', seit: null }, 'b');
    const r = await wechsleStatus(db, principal, o);
    expect(r).toEqual({ id: 'x1', status: 'b', von: 'a', geaendert: true });
    expect(speichere).toHaveBeenCalledWith(expect.anything(), {
      status: 'b',
      seit: '2026-10-17T08:00:00.000Z',
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      akteurId: 'u1',
      entitaetTyp: 'test_status',
      entitaetId: 'x1',
      altWert: { status: 'a', seit: null },
      neuWert: { status: 'b', seit: '2026-10-17T08:00:00.000Z' },
    });
    expect(danach).toHaveBeenCalledOnce();
  });

  it('gleicher Status ohne Feldänderung: nichts speichern, kein Audit, kein Folgeschritt', async () => {
    const { db, audit } = fakeDb();
    const { o, speichere, danach } = optionen(
      { status: 'b', seit: '2026-10-17T08:00:00.000Z' },
      'b',
    );
    expect((await wechsleStatus(db, principal, o)).geaendert).toBe(false);
    expect(speichere).not.toHaveBeenCalled();
    expect(danach).not.toHaveBeenCalled();
    expect(audit).toHaveLength(0);
  });

  it('lehnt unerlaubte Übergänge und unbekannte Datensätze ab', async () => {
    const { db, audit } = fakeDb();
    await expect(wechsleStatus(db, principal, optionen({ status: 'a' }, 'c').o)).rejects.toThrow(
      BadRequestException,
    );
    await expect(wechsleStatus(db, principal, optionen(undefined, 'b').o)).rejects.toThrow(
      NotFoundException,
    );
    await expect(wechsleStatus(db, principal, optionen({ status: 'zzz' }, 'b').o)).rejects.toThrow(
      'Unbekannter aktueller Status',
    );
    expect(audit).toHaveLength(0);
  });
});
