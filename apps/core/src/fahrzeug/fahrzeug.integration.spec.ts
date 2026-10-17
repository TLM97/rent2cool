/**
 * Integrationstest der Fahrzeugakte gegen die echte DB. Nur mit
 * RUN_INTEGRATION=1 (lokal gegen den Stack).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@rent2cool/shared';
import { createDbClient } from '../db/client';
import { mandant } from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';
import { FahrzeugService } from './fahrzeug.service';
import type { FahrzeugErstellen } from './dto';

/** Ausführender für Statuswechsel (Audit-Pflicht). */
const AKTEUR: Principal = { akteurId: 'test-integration', rollen: ['admin'] };
const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ?? 'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool';

function neuesFahrzeug(kennzeichen: string): FahrzeugErstellen {
  return {
    kennzeichen,
    zulGesamtmasseKg: 3500,
    benoetigteFuehrerscheinklasse: 'B',
    hatFahrtenschreiber: true,
    aggregat: {
      typ: 'Kuehlaufbau',
      sensoren: [{ messgroesse: 'temperatur_laderaum', einheit: 'C' }],
    },
  };
}

describe.skipIf(!RUN)('Fahrzeugakte (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;
  let service: FahrzeugService;

  beforeAll(async () => {
    client = createDbClient(url);
    service = new FahrzeugService(client.db);
    await client.db
      .insert(mandant)
      .values({ id: PLACEHOLDER_MANDANT_ID, name: 'Test-Mandant' })
      .onConflictDoNothing();
  });
  afterAll(async () => {
    await client.sql.end({ timeout: 5 });
  });

  it('legt Akte an, steuert Status und bewertet Buchbarkeit über Kalibrierung', async () => {
    const { id } = await service.erstelle(AKTEUR, neuesFahrzeug(`T-${randomUUID().slice(0, 8)}`));

    const akte = await service.holeAkte(id);
    expect(akte.aggregate).toHaveLength(1);
    expect(akte.aggregate[0]!.sensoren).toHaveLength(1);
    const sensorId = akte.aggregate[0]!.sensoren[0]!.id;

    // Noch nicht buchbar: Status 'angelegt' und keine Kalibrierung.
    expect((await service.buchbarkeit(id, new Date())).buchbar).toBe(false);

    await service.aendereStatus(AKTEUR, id, 'verfuegbar');
    // Immer noch nicht buchbar: keine gültige Kalibrierung.
    expect((await service.buchbarkeit(id, new Date())).buchbar).toBe(false);

    await service.fuegeKalibrierungHinzu(AKTEUR, sensorId, {
      durchgefuehrtAm: new Date().toISOString(),
      gueltigBis: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    });
    // Jetzt buchbar.
    expect((await service.buchbarkeit(id, new Date())).buchbar).toBe(true);
  });

  it('verweigert einen unerlaubten Statusübergang', async () => {
    const { id } = await service.erstelle(AKTEUR, neuesFahrzeug(`T-${randomUUID().slice(0, 8)}`));
    await service.aendereStatus(AKTEUR, id, 'verfuegbar');
    await expect(service.aendereStatus(AKTEUR, id, 'stillgelegt')).rejects.toThrow();
  });

  it('listet fällige Kalibrierungen (Sensor ohne Kalibrierung)', async () => {
    const { id } = await service.erstelle(AKTEUR, neuesFahrzeug(`T-${randomUUID().slice(0, 8)}`));
    const akte = await service.holeAkte(id);
    const sensorId = akte.aggregate[0]!.sensoren[0]!.id;
    const faellig = await service.faelligeKalibrierungen(undefined, new Date());
    expect(faellig.some((f) => f.sensorId === sensorId && f.gueltigBis === null)).toBe(true);
  });
});
