/**
 * Integrationstest des Temperaturnachweises gegen die echte DB: Messwerte
 * einfügen, Nachweis berechnen, ablegen. Nur mit RUN_INTEGRATION=1.
 *
 *   pnpm stack:up && pnpm --filter @rent2cool/core db:migrate
 *   RUN_INTEGRATION=1 pnpm --filter @rent2cool/core test
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient } from '../db/client';
import { BerichtService } from './bericht.service';
import { KonfigProfilQuelle } from './profil';
import { JsonNachweisRenderer, RendererRegistry } from './renderer';
import { HmacSignierer } from './signierer';
import { InMemoryBerichtSpeicher } from './speicher';

const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ??
  'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool_test';

describe.skipIf(!RUN)('Temperaturnachweis (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;
  let service: BerichtService;
  const fahrzeugId = randomUUID();
  const basis = Date.UTC(2026, 9, 16, 8, 0, 0);

  beforeAll(async () => {
    client = createDbClient(url);
    service = new BerichtService(
      client.db,
      new KonfigProfilQuelle(),
      new HmacSignierer('test-schluessel'),
      new RendererRegistry([new JsonNachweisRenderer()]),
      new InMemoryBerichtSpeicher(),
    );
    // Messwerte einfügen: 3 im Band, 1 über der Obergrenze, plus eine Zeitlücke.
    const zeilen = [
      { min: 0, wert: 4 },
      { min: 1, wert: 5 },
      { min: 2, wert: 9.9 }, // über 8 -> Grenzverletzung
      { min: 40, wert: 5 }, // 38 min Lücke
    ];
    for (const z of zeilen) {
      const zeit = new Date(basis + z.min * 60_000).toISOString();
      await client.sql`
        insert into messwert (zeit, fahrzeug_id, messgroesse, wert, einheit, nachricht_id, quelle)
        values (${zeit}, ${fahrzeugId}, 'temperatur_laderaum', ${z.wert}, 'C', ${randomUUID()}, 'test')`;
    }
  });

  afterAll(async () => {
    await client.sql.end({ timeout: 5 });
  });

  it('erzeugt einen Nachweis mit Grenzverletzung, Lücke und Signatur', async () => {
    const res = await service.erzeugeUndLege(
      {
        fahrzeugId,
        messgroesse: 'temperatur_laderaum',
        von: new Date(basis - 60_000).toISOString(),
        bis: new Date(basis + 60 * 60_000).toISOString(),
        profilName: '2-8',
        lueckeSchwelleMin: 5,
      },
      'json',
    );

    expect(res.nachweis.kennzahlen.anzahl).toBe(4);
    expect(res.nachweis.bewertung).toBe('verletzt');
    expect(res.nachweis.grenzverletzungen).toHaveLength(1);
    expect(res.nachweis.luecken).toHaveLength(1);
    expect(res.nachweis.integritaet.signatur).toMatch(/^[0-9a-f]+$/);
    expect(res.gespeichert.ref).toMatch(/^memory:\/\/temperaturnachweis\//);
  });
});
