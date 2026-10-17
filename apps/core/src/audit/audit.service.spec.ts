import { describe, expect, it } from 'vitest';
import type { Principal } from '@rent2cool/shared';
import type { Database } from '../db/client';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('schreibt einen vollständigen Audit-Eintrag', async () => {
    const eingefuegt: Record<string, unknown>[] = [];
    const db = {
      insert: () => ({
        values: async (v: Record<string, unknown>) => {
          eingefuegt.push(v);
        },
      }),
    } as unknown as Database;

    const service = new AuditService(db);
    const principal: Principal = {
      akteurId: 'user-9',
      rollen: ['admin', 'ops'],
      mandantId: 'm-1',
      name: 'admin.dev',
    };
    await service.protokolliere(principal, {
      aktion: 'POST',
      entitaetTyp: 'demo',
      entitaetId: 'x1',
      altWert: null,
      neuWert: { a: 1 },
    });

    expect(eingefuegt).toHaveLength(1);
    expect(eingefuegt[0]).toMatchObject({
      akteurId: 'user-9',
      akteurName: 'admin.dev',
      akteurRolle: 'admin,ops',
      aktion: 'POST',
      entitaetTyp: 'demo',
      entitaetId: 'x1',
      mandantId: 'm-1',
      quelle: 'core',
    });
  });
});
