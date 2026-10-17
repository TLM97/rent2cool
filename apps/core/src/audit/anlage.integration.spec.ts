/**
 * Integrationstest Anlegen mit Audit gegen die echte DB: vollständiger neuer
 * Datensatz im Audit (in derselben Transaktion), keine Einträge bei
 * idempotenter Wiederholung oder Ablehnung, lückenlose Rechnungsnummern.
 * Eigener Mandant je Lauf, damit parallele Tests nicht stören.
 * Nur mit RUN_INTEGRATION=1.
 */
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@rent2cool/shared';
import { AbweichungService } from '../alarm/abweichung.service';
import { BerichtService } from '../bericht/bericht.service';
import { KonfigProfilQuelle } from '../bericht/profil';
import { JsonNachweisRenderer, RendererRegistry } from '../bericht/renderer';
import { HmacSignierer } from '../bericht/signierer';
import { InMemoryBerichtSpeicher } from '../bericht/speicher';
import type { Env } from '../config/env';
import { createDbClient } from '../db/client';
import { auditEvent, mandant } from '../db/schema';
import { FahrzeugService } from '../fahrzeug/fahrzeug.service';
import { KundeService } from '../kunde/kunde.service';
import { MieteService } from '../miete/miete.service';
import { RechnungService } from '../rechnung/rechnung.service';
import { AuditService } from './audit.service';

const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ?? 'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool';
const fakeConfig = {
  get: (k: string) => (k === 'RECHNUNG_STEUERSATZ' ? 19 : 'EUR'),
} as unknown as ConfigService<Env, true>;

describe.skipIf(!RUN)('Anlegen mit Audit (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;
  let fahrzeuge: FahrzeugService;
  let kunden: KundeService;
  let mieten: MieteService;
  let rechnungen: RechnungService;
  let abweichungen: AbweichungService;
  const mandantId = randomUUID();
  const ops: Principal = {
    akteurId: `test-anlage-${randomUUID().slice(0, 8)}`,
    rollen: ['ops'],
    mandantId,
    name: 'ops.anlage',
  };

  async function audit(entitaetId: string, typ: string) {
    return client.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.entitaetId, entitaetId), eq(auditEvent.entitaetTyp, typ)));
  }

  /** Kalibriertes, verfügbares Fahrzeug und freigegebener Kunde im Test-Mandanten. */
  async function fahrzeugUndKunde() {
    const sn = `SN-${randomUUID().slice(0, 8)}`;
    const { id: fahrzeugId } = await fahrzeuge.erstelle(ops, {
      kennzeichen: `AN-${randomUUID().slice(0, 8)}`,
      zulGesamtmasseKg: 3500,
      benoetigteFuehrerscheinklasse: 'B',
      hatFahrtenschreiber: false,
      aggregat: {
        typ: 'Kühlkoffer',
        sensoren: [{ messgroesse: 'temperatur_laderaum', einheit: 'C', seriennummer: sn }],
      },
    });
    const sensorId = (await fahrzeuge.holeAkte(fahrzeugId)).aggregate[0]!.sensoren[0]!.id;
    await fahrzeuge.fuegeKalibrierungHinzu(ops, sensorId, {
      durchgefuehrtAm: new Date().toISOString(),
      gueltigBis: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      zertifikatRef: 'KAL-ANLAGE',
    });
    await fahrzeuge.aendereStatus(ops, fahrzeugId, 'verfuegbar');
    const { id: kundeId } = await kunden.erstelleKunde(ops, {
      firmenname: 'Anlagekunde',
      ort: 'Berlin',
      land: 'DE',
    });
    await kunden.aendereKundeStatus(ops, kundeId, 'in_pruefung');
    await kunden.aendereKundeStatus(ops, kundeId, 'freigegeben');
    return { fahrzeugId, sensorId, sn, kundeId };
  }

  async function beendeteMiete(): Promise<string> {
    const { fahrzeugId, kundeId } = await fahrzeugUndKunde();
    const { id } = await mieten.erstelle(ops, {
      kundeId,
      fahrzeugId,
      auslandsfahrtGeplant: false,
      startGeplant: new Date(Date.now() + 3600_000).toISOString(),
      endeGeplant: new Date(Date.now() + 7200_000).toISOString(),
    });
    await mieten.aendereStatus(ops, id, 'aktiv');
    await mieten.aendereStatus(ops, id, 'beendet');
    return id;
  }

  beforeAll(async () => {
    client = createDbClient(url);
    fahrzeuge = new FahrzeugService(client.db);
    kunden = new KundeService(client.db);
    const berichte = new BerichtService(
      client.db,
      new KonfigProfilQuelle(),
      new HmacSignierer('test'),
      new RendererRegistry([new JsonNachweisRenderer()]),
      new InMemoryBerichtSpeicher(),
    );
    mieten = new MieteService(client.db, fahrzeuge, kunden, berichte);
    rechnungen = new RechnungService(client.db, fakeConfig, mieten);
    abweichungen = new AbweichungService(client.db);
    await client.db.insert(mandant).values({ id: mandantId, name: 'Test-Mandant Anlage' });
  });
  afterAll(async () => {
    await client.sql.end({ timeout: 5 });
  });

  it('Fahrzeugakte, Kalibrierung und Kunde: vollständiger Datensatz im Audit', async () => {
    const { fahrzeugId, sensorId, sn, kundeId } = await fahrzeugUndKunde();

    const [fz] = await audit(fahrzeugId, 'fahrzeug');
    expect(fz).toMatchObject({
      akteurId: ops.akteurId,
      akteurName: 'ops.anlage',
      aktion: 'POST',
      altWert: null,
      neuWert: {
        id: fahrzeugId,
        status: 'angelegt',
        zulGesamtmasseKg: 3500,
        aggregat: {
          typ: 'Kühlkoffer',
          sensoren: [{ id: sensorId, seriennummer: sn, aktiv: true }],
        },
      },
    });

    // Kalibrierung unter der Sensor-ID, mit dem Erfasser.
    const [kal] = await audit(sensorId, 'kalibrierung');
    expect(kal?.neuWert).toMatchObject({
      sensorId,
      zertifikatRef: 'KAL-ANLAGE',
      erfasstVon: ops.akteurId,
    });

    // Verlauf der Akte: Fahrzeug und Sensor zusammen, neueste zuerst.
    const verlauf = await new AuditService(client.db).verlauf({
      entitaetIds: [fahrzeugId, sensorId],
      typen: ['fahrzeug', 'fahrzeug_status', 'kalibrierung', 'sensor_tausch'],
      limit: 10,
      offset: 0,
    });
    expect(verlauf.eintraege.map((e) => e.entitaetTyp)).toEqual([
      'fahrzeug_status',
      'kalibrierung',
      'fahrzeug',
    ]);

    const [k] = await audit(kundeId, 'kunde');
    expect(k?.neuWert).toMatchObject({
      id: kundeId,
      firmenname: 'Anlagekunde',
      ort: 'Berlin',
      status: 'angelegt',
      mandantId,
    });
  });

  it('Fahrer: Audit beim Anlegen; fremder Mandant legt nichts an', async () => {
    const { kundeId } = await fahrzeugUndKunde();
    const { id } = await kunden.erstelleFahrer(ops, kundeId, {
      name: 'Erika Anlage',
      fuehrerscheinKlasse: 'B',
    });
    expect((await audit(id, 'fahrer'))[0]?.neuWert).toMatchObject({
      id,
      kundeId,
      name: 'Erika Anlage',
      status: 'angelegt',
    });

    const fremd: Principal = { akteurId: 'test-fremd', rollen: ['ops'], mandantId: randomUUID() };
    await expect(
      kunden.erstelleFahrer(fremd, kundeId, { name: 'X', fuehrerscheinKlasse: 'B' }),
    ).rejects.toThrow(NotFoundException);
    expect(await kunden.listeFahrer(kundeId)).toHaveLength(1);
  });

  it('Buchung: idempotente Wiederholung erzeugt keinen zweiten Audit-Eintrag', async () => {
    const { fahrzeugId, kundeId } = await fahrzeugUndKunde();
    const eingabe = {
      kundeId,
      fahrzeugId,
      auslandsfahrtGeplant: false,
      startGeplant: new Date(Date.now() + 3600_000).toISOString(),
      endeGeplant: new Date(Date.now() + 7200_000).toISOString(),
      idempotencyKey: randomUUID(),
    };
    const erst = await mieten.erstelle(ops, eingabe);
    const nochmal = await mieten.erstelle(ops, eingabe);
    expect(nochmal).toMatchObject({ id: erst.id, idempotent: true });
    const eintraege = await audit(erst.id, 'miete');
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]?.neuWert).toMatchObject({
      id: erst.id,
      kundeId,
      fahrzeugId,
      status: 'bestaetigt',
    });
  });

  it('Rechnung: Audit beim Anlegen, Nummern lückenlos auch nach abgewiesenem Doppel', async () => {
    const a = await beendeteMiete();
    const b = await beendeteMiete();
    const ergebnisse = await Promise.allSettled([
      rechnungen.erstelle(ops, { mieteId: a, netto: 100 }),
      rechnungen.erstelle(ops, { mieteId: a, netto: 100 }),
    ]);
    const erfolgreich = ergebnisse.filter((e) => e.status === 'fulfilled');
    expect(erfolgreich).toHaveLength(1);
    const erste = (
      erfolgreich[0] as PromiseFulfilledResult<{ id: string; rechnungsnummer: string }>
    ).value;
    const zweite = await rechnungen.erstelle(ops, { mieteId: b, netto: 50 });
    const nr = (r: { rechnungsnummer: string }) => Number(r.rechnungsnummer.split('-')[1]);
    expect(nr(zweite)).toBe(nr(erste) + 1);

    expect((await audit(erste.id, 'rechnung'))[0]?.neuWert).toMatchObject({
      id: erste.id,
      rechnungsnummer: erste.rechnungsnummer,
      nettoCent: 10000,
      bruttoCent: 11900,
      status: 'entwurf',
    });
  });

  it('Abweichung: Audit beim Anlegen', async () => {
    const { id } = await abweichungen.erstelle(ops, {
      bezugTyp: 'miete',
      bezugId: randomUUID(),
      beschreibung: 'Tür offen (Test)',
      schweregrad: 'mittel',
    });
    expect((await audit(id, 'abweichung'))[0]?.neuWert).toMatchObject({
      id,
      beschreibung: 'Tür offen (Test)',
      schweregrad: 'mittel',
      status: 'erfasst',
    });
  });
});
