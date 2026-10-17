/**
 * Integrationstest Sensortausch gegen die echte DB: Ausbau/Einbau mit
 * Historie, Buchbarkeit vor und nach der Kalibrierung, Wiederholung ist
 * idempotent, Doppel-Einbau und Mandantentrennung, Audit mit alt/neu.
 * Nur mit RUN_INTEGRATION=1.
 */
import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@rent2cool/shared';
import { createDbClient } from '../db/client';
import { auditEvent, mandant, sensor } from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';
import { FahrzeugService } from './fahrzeug.service';

const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ?? 'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool';

const TAG = 86_400_000;

describe.skipIf(!RUN)('Sensortausch (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;
  let service: FahrzeugService;
  const ops: Principal = { akteurId: `test-ops-${randomUUID().slice(0, 8)}`, rollen: ['ops'] };

  function kalibrierung() {
    const jetzt = Date.now();
    return {
      durchgefuehrtAm: new Date(jetzt - TAG).toISOString(),
      gueltigBis: new Date(jetzt + 365 * TAG).toISOString(),
      zertifikatRef: 'TEST-KAL',
    };
  }

  /** Verfügbares, kalibriertes Fahrzeug mit einem Laderaum-Sensor. */
  async function fahrzeugMitSensor(): Promise<{ fahrzeugId: string; sensorId: string; sn: string }> {
    const sn = `SN-${randomUUID().slice(0, 8)}`;
    const { id: fahrzeugId } = await service.erstelle(undefined, {
      kennzeichen: `T-${randomUUID().slice(0, 8)}`,
      zulGesamtmasseKg: 3500,
      benoetigteFuehrerscheinklasse: 'B',
      hatFahrtenschreiber: false,
      aggregat: { sensoren: [{ messgroesse: 'temperatur_laderaum', einheit: 'C', seriennummer: sn }] },
    });
    const sensorId = (await service.holeAkte(fahrzeugId)).aggregate[0]!.sensoren[0]!.id;
    await service.fuegeKalibrierungHinzu(sensorId, 'test', kalibrierung());
    await service.aendereStatus(fahrzeugId, 'verfuegbar');
    return { fahrzeugId, sensorId, sn };
  }

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

  it('tauscht den Sensor mit Historie; ohne neue Kalibrierung nicht buchbar', async () => {
    const { fahrzeugId, sensorId, sn } = await fahrzeugMitSensor();
    expect((await service.buchbarkeit(fahrzeugId, new Date())).buchbar).toBe(true);

    const neuSn = `${sn}-NEU`;
    const r = await service.tauscheSensor(ops, sensorId, { seriennummer: neuSn, grund: 'Messwerte springen' });
    expect(r).toMatchObject({ alterSensorId: sensorId, fahrzeugId, idempotent: false });

    const sensoren = (await service.holeAkte(fahrzeugId)).aggregate[0]!.sensoren;
    const alt = sensoren.find((s) => s.id === sensorId)!;
    const neu = sensoren.find((s) => s.id === r.neuerSensorId)!;
    expect(alt).toMatchObject({ aktiv: false, ausbauGrund: 'Messwerte springen' });
    expect(alt.ausgebautAm).not.toBeNull();
    expect(alt.kalibriertBis).not.toBeNull(); // Historie bleibt erhalten
    expect(neu).toMatchObject({ aktiv: true, seriennummer: neuSn, vorgaengerId: sensorId, messgroesse: 'temperatur_laderaum' });
    expect(neu.kalibriertBis).toBeNull();
    expect(neu.eingebautAm.getTime()).toBe(alt.ausgebautAm!.getTime()); // lückenlos

    const b = await service.buchbarkeit(fahrzeugId, new Date());
    expect(b.buchbar).toBe(false);
    await service.fuegeKalibrierungHinzu(r.neuerSensorId, 'test', kalibrierung());
    expect((await service.buchbarkeit(fahrzeugId, new Date())).buchbar).toBe(true);

    const audit = await client.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.entitaetId, sensorId), eq(auditEvent.entitaetTyp, 'sensor_tausch')));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      akteurId: ops.akteurId,
      altWert: { sensorId, seriennummer: sn, aktiv: true },
      neuWert: { sensorId: r.neuerSensorId, seriennummer: neuSn, grund: 'Messwerte springen' },
    });
  });

  it('mit Kalibrierung bleibt das Fahrzeug buchbar; Wiederholung ist idempotent', async () => {
    const { fahrzeugId, sensorId, sn } = await fahrzeugMitSensor();
    const eingabe = { seriennummer: `${sn}-B`, grund: 'Routinetausch', kalibrierung: kalibrierung() };
    const erst = await service.tauscheSensor(ops, sensorId, eingabe);
    expect(erst.kalibrierungId).toBeDefined();
    expect((await service.buchbarkeit(fahrzeugId, new Date())).buchbar).toBe(true);

    const nochmal = await service.tauscheSensor(ops, sensorId, eingabe);
    expect(nochmal).toMatchObject({ neuerSensorId: erst.neuerSensorId, idempotent: true });
    const alle = await client.db.select().from(sensor).where(eq(sensor.vorgaengerId, sensorId));
    expect(alle).toHaveLength(1);

    // Anderer neuer Sensor für einen bereits ersetzten → Konflikt.
    await expect(service.tauscheSensor(ops, sensorId, { seriennummer: 'ANDERS', grund: 'x' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('gleichzeitige Tausch-Anfragen: genau ein neuer Sensor', async () => {
    const { sensorId, sn } = await fahrzeugMitSensor();
    const ergebnisse = await Promise.allSettled([
      service.tauscheSensor(ops, sensorId, { seriennummer: `${sn}-P1`, grund: 'parallel' }),
      service.tauscheSensor(ops, sensorId, { seriennummer: `${sn}-P2`, grund: 'parallel' }),
    ]);
    expect(ergebnisse.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    expect(await client.db.select().from(sensor).where(eq(sensor.vorgaengerId, sensorId))).toHaveLength(1);
  });

  it('verhindert Doppel-Einbau und Zugriff fremder Mandanten', async () => {
    const a = await fahrzeugMitSensor();
    const b = await fahrzeugMitSensor();
    await expect(service.tauscheSensor(ops, b.sensorId, { seriennummer: a.sn, grund: 'x' })).rejects.toThrow(
      /bereits in .* eingebaut/,
    );
    const fremd: Principal = { akteurId: 'fremd', rollen: ['ops'], mandantId: randomUUID() };
    await expect(service.tauscheSensor(fremd, a.sensorId, { seriennummer: 'Z', grund: 'x' })).rejects.toThrow(
      NotFoundException,
    );
    // Nichts verändert.
    const [s] = await client.db.select().from(sensor).where(eq(sensor.id, b.sensorId));
    expect(s?.aktiv).toBe(true);
  });

  it('die Datenbank erzwingt: aktiv genau dann, wenn nicht ausgebaut', async () => {
    const { sensorId } = await fahrzeugMitSensor();
    await expect(client.db.update(sensor).set({ aktiv: false }).where(eq(sensor.id, sensorId))).rejects.toThrow();
  });
});
