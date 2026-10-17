/**
 * Integrationstest Stammdaten ändern (Kunde, Fahrer, Fahrzeug) gegen die echte
 * DB: nur geänderte Felder, Audit mit altem und neuem Wert, Versionsschutz,
 * Mandantentrennung. Nur mit RUN_INTEGRATION=1.
 */
import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@rent2cool/shared';
import { createDbClient } from '../db/client';
import { auditEvent, mandant } from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';
import { FahrzeugService } from '../fahrzeug/fahrzeug.service';
import { KundeService } from './kunde.service';

const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ?? 'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool';

describe.skipIf(!RUN)('Stammdaten ändern (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;
  let kunden: KundeService;
  let fahrzeuge: FahrzeugService;
  const ops: Principal = { akteurId: `test-ops-${randomUUID().slice(0, 8)}`, rollen: ['ops'] };
  const fremd: Principal = { akteurId: 'test-fremd', rollen: ['ops'], mandantId: randomUUID() };

  async function auditFuer(entitaetId: string) {
    return client.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.entitaetId, entitaetId), eq(auditEvent.aktion, 'PATCH')));
  }

  beforeAll(async () => {
    client = createDbClient(url);
    kunden = new KundeService(client.db);
    fahrzeuge = new FahrzeugService(client.db);
    await client.db
      .insert(mandant)
      .values({ id: PLACEHOLDER_MANDANT_ID, name: 'Test-Mandant' })
      .onConflictDoNothing();
  });
  afterAll(async () => {
    await client.sql.end({ timeout: 5 });
  });

  it('Kunde: ändert nur geänderte Felder und protokolliert alt/neu', async () => {
    const { id } = await kunden.erstelleKunde(undefined, {
      firmenname: `Stamm ${randomUUID().slice(0, 8)}`,
      ort: 'Berlin',
      ustId: 'DE111111111',
      land: 'DE',
    });
    const v1 = (await kunden.holeKunde(id)).aktualisiertAm.toISOString();

    const r = await kunden.aendereKunde(ops, id, { version: v1, ort: 'Potsdam', ustId: null, land: 'DE' });
    expect(r.geaendert).toEqual(['ort', 'ustId']);
    const nachher = await kunden.holeKunde(id);
    expect(nachher.ort).toBe('Potsdam');
    expect(nachher.ustId).toBeNull();
    expect(nachher.aktualisiertAm.toISOString()).toBe(r.version);

    const audit = await auditFuer(id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      akteurId: ops.akteurId,
      entitaetTyp: 'kunde',
      altWert: { ort: 'Berlin', ustId: 'DE111111111' },
      neuWert: { ort: 'Potsdam', ustId: null },
    });

    // Nichts geändert → kein Update, kein Audit-Eintrag, Version bleibt.
    const leer = await kunden.aendereKunde(ops, id, { version: r.version, ort: 'Potsdam' });
    expect(leer).toEqual({ id, version: r.version, geaendert: [] });
    expect(await auditFuer(id)).toHaveLength(1);

    // Veralteter Stand → 409, nichts überschrieben.
    await expect(kunden.aendereKunde(ops, id, { version: v1, ort: 'Hamburg' })).rejects.toThrow(ConflictException);
    expect((await kunden.holeKunde(id)).ort).toBe('Potsdam');

    // Anderer Mandant sieht den Kunden nicht.
    await expect(kunden.aendereKunde(fremd, id, { version: r.version, ort: 'X' })).rejects.toThrow(NotFoundException);
  });

  it('Kunde: gleichzeitiges Speichern mit demselben Stand – genau eines gewinnt', async () => {
    const { id } = await kunden.erstelleKunde(undefined, { firmenname: 'Parallel', land: 'DE' });
    const v = (await kunden.holeKunde(id)).aktualisiertAm.toISOString();
    const ergebnisse = await Promise.allSettled([
      kunden.aendereKunde(ops, id, { version: v, ort: 'A' }),
      kunden.aendereKunde(ops, id, { version: v, ort: 'B' }),
    ]);
    expect(ergebnisse.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    expect(ergebnisse.filter((e) => e.status === 'rejected')).toHaveLength(1);
    expect(await auditFuer(id)).toHaveLength(1);
  });

  it('Fahrer: Führerscheindaten ändern und leeren', async () => {
    const { id: kundeId } = await kunden.erstelleKunde(undefined, { firmenname: 'Fahrerfirma', land: 'DE' });
    const { id } = await kunden.erstelleFahrer(kundeId, {
      name: 'Erika Muster',
      fuehrerscheinKlasse: 'B',
      fuehrerscheinGueltigBis: '2030-12-31T22:59:00.000Z',
    });
    const v1 = (await kunden.holeFahrer(id)).aktualisiertAm.toISOString();
    const r = await kunden.aendereFahrer(ops, id, {
      version: v1,
      name: 'Erika Muster',
      fuehrerscheinKlasse: 'C1',
      fuehrerscheinGueltigBis: '2035-06-30T21:59:00.000Z',
    });
    expect(r.geaendert).toEqual(['fuehrerscheinKlasse', 'fuehrerscheinGueltigBis']);
    const [eintrag] = await auditFuer(id);
    expect(eintrag?.altWert).toEqual({ fuehrerscheinKlasse: 'B', fuehrerscheinGueltigBis: '2030-12-31T22:59:00.000Z' });
    expect(eintrag?.neuWert).toEqual({ fuehrerscheinKlasse: 'C1', fuehrerscheinGueltigBis: '2035-06-30T21:59:00.000Z' });

    await kunden.aendereFahrer(ops, id, { version: r.version, fuehrerscheinGueltigBis: null });
    expect((await kunden.holeFahrer(id)).fuehrerscheinGueltigBis).toBeNull();
    await expect(kunden.aendereFahrer(fremd, id, { version: r.version, name: 'X' })).rejects.toThrow(NotFoundException);
  });

  it('Fahrzeug: Stammdaten ändern, doppeltes Kennzeichen wird abgelehnt', async () => {
    const kz = `S-${randomUUID().slice(0, 8)}`;
    const { id } = await fahrzeuge.erstelle(undefined, {
      kennzeichen: kz,
      zulGesamtmasseKg: 3500,
      benoetigteFuehrerscheinklasse: 'B',
      hatFahrtenschreiber: false,
    });
    const { id: anderes } = await fahrzeuge.erstelle(undefined, {
      kennzeichen: `${kz}-2`,
      zulGesamtmasseKg: 3500,
      benoetigteFuehrerscheinklasse: 'B',
      hatFahrtenschreiber: false,
    });
    const v1 = (await fahrzeuge.holeAkte(id)).fahrzeug.aktualisiertAm.toISOString();
    const r = await fahrzeuge.aendere(ops, id, {
      version: v1,
      zulGesamtmasseKg: 7490,
      benoetigteFuehrerscheinklasse: 'C1',
      hatFahrtenschreiber: true,
      vin: null,
    });
    expect(r.geaendert).toEqual(['zulGesamtmasseKg', 'benoetigteFuehrerscheinklasse', 'hatFahrtenschreiber']);
    const [eintrag] = await auditFuer(id);
    expect(eintrag?.altWert).toEqual({ zulGesamtmasseKg: 3500, benoetigteFuehrerscheinklasse: 'B', hatFahrtenschreiber: false });

    const vAnderes = (await fahrzeuge.holeAkte(anderes)).fahrzeug.aktualisiertAm.toISOString();
    await expect(fahrzeuge.aendere(ops, anderes, { version: vAnderes, kennzeichen: kz })).rejects.toThrow(
      ConflictException,
    );
    expect(await auditFuer(anderes)).toHaveLength(0);
  });
});
