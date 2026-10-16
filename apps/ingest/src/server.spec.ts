import { afterEach, describe, expect, it } from 'vitest';
import { baueHuelle, type TelemetrieNachricht } from '@rent2cool/shared';
import { buildServer } from './server';

const SCHLUESSEL = 'test-platzhalter-schluessel';

function nachricht(): TelemetrieNachricht {
  return {
    nachrichtId: 'n-0001-abcdef',
    fahrzeugId: '018f3a2b-7c4d-7e2a-9b1c-2f3a4b5c6d7e',
    quelle: 'simulator',
    gesendetAm: '2026-10-16T08:00:00.000Z',
    messwerte: [{ messgroesse: 'temperatur_laderaum', wert: 5.2, einheit: 'C' }],
  };
}

function baueServer() {
  const publiziert: { fahrzeugId: string; json: string }[] = [];
  const app = buildServer({
    signierSchluessel: SCHLUESSEL,
    publiziere: async (fahrzeugId, json) => {
      publiziert.push({ fahrzeugId, json });
    },
    istBereit: () => true,
    logLevel: 'silent',
  });
  return { app, publiziert };
}

describe('Telematik-Eingang', () => {
  let offen: ReturnType<typeof baueServer>['app'] | undefined;
  afterEach(async () => {
    await offen?.close();
    offen = undefined;
  });

  it('nimmt eine gültige, signierte Nachricht an (202) und publiziert sie', async () => {
    const { app, publiziert } = baueServer();
    offen = app;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/telemetrie',
      payload: baueHuelle(nachricht(), SCHLUESSEL),
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ status: 'angenommen', nachrichtId: 'n-0001-abcdef' });
    expect(publiziert).toHaveLength(1);
    expect(publiziert[0]!.fahrzeugId).toBe(nachricht().fahrzeugId);
  });

  it('lehnt falsche Signatur mit 401 ab und publiziert nichts', async () => {
    const { app, publiziert } = baueServer();
    offen = app;
    const huelle = baueHuelle(nachricht(), SCHLUESSEL);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/telemetrie',
      payload: { ...huelle, signatur: 'deadbeef' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ grund: 'signatur' });
    expect(publiziert).toHaveLength(0);
  });

  it('lehnt kaputtes Format mit 400 ab', async () => {
    const { app } = baueServer();
    offen = app;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/telemetrie',
      payload: { payload: 123 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('health meldet ok', async () => {
    const { app } = baueServer();
    offen = app;
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', service: 'rent2cool-ingest' });
  });
});
