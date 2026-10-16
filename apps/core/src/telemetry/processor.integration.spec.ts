/**
 * Integrationstest des Verarbeiters gegen eine echte PostgreSQL/TimescaleDB.
 * Läuft nur mit RUN_INTEGRATION=1 (lokal gegen den Docker-Stack); in der CI
 * ohne Datenbank wird er übersprungen, damit `pnpm test` grün bleibt.
 *
 * Start lokal:
 *   pnpm stack:up
 *   pnpm --filter @rent2cool/core db:migrate
 *   RUN_INTEGRATION=1 pnpm --filter @rent2cool/core test
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TelemetrieNachricht } from '@rent2cool/shared';
import { createDbClient } from '../db/client';
import { messwert } from '../db/schema';
import { verarbeiteNachricht } from './processor';

const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ??
  'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool';

function nachricht(id: string, fahrzeugId: string): TelemetrieNachricht {
  return {
    nachrichtId: id,
    fahrzeugId,
    quelle: 'integrationstest',
    gesendetAm: new Date().toISOString(),
    messwerte: [
      { messgroesse: 'temperatur_laderaum', wert: 5.1, einheit: 'C' },
      { messgroesse: 'tuer_offen', wert: 0, einheit: 'bool' },
    ],
  };
}

describe.skipIf(!RUN)('Verarbeiter (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;

  beforeAll(() => {
    client = createDbClient(url);
  });
  afterAll(async () => {
    await client.sql.end({ timeout: 5 });
  });

  it('speichert einmal und erkennt die Wiederholung als Duplikat', async () => {
    const id = `it-${randomUUID()}`;
    const fahrzeugId = randomUUID();
    const n = nachricht(id, fahrzeugId);

    const r1 = await verarbeiteNachricht(client.db, n);
    // "Neustart/Neuzustellung": exakt dieselbe Nachricht noch einmal.
    const r2 = await verarbeiteNachricht(client.db, n);

    expect(r1).toBe('gespeichert');
    expect(r2).toBe('duplikat');

    const zeilen = await client.db
      .select()
      .from(messwert)
      .where(eq(messwert.nachrichtId, id));
    // 2 Messwerte, nicht 4 -> keine Doppelspeicherung.
    expect(zeilen).toHaveLength(2);
  });

  it('verweigert das Ändern eines Messwerts (append-only)', async () => {
    const id = `it-${randomUUID()}`;
    await verarbeiteNachricht(client.db, nachricht(id, randomUUID()));
    await expect(
      client.sql`update messwert set wert = 99 where nachricht_id = ${id}`,
    ).rejects.toThrow();
  });
});
