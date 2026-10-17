/**
 * Integrationstest Kunde & Fahrer gegen die echte DB. Nur mit RUN_INTEGRATION=1.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@rent2cool/shared';
import { createDbClient } from '../db/client';
import { mandant } from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';
import { FahrzeugService } from '../fahrzeug/fahrzeug.service';
import { KundeService } from './kunde.service';

/** Ausführender für Statuswechsel (Audit-Pflicht). */
const AKTEUR: Principal = { akteurId: 'test-integration', rollen: ['admin'] };
const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ??
  'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool_test';

describe.skipIf(!RUN)('Kunde & Fahrer (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;
  let kunden: KundeService;
  let fahrzeuge: FahrzeugService;

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

  it('führt Kunde und Fahrer durch die Freigabe und prüft die Einsatzbereitschaft', async () => {
    // Kunde: angelegt -> in_pruefung -> freigegeben
    const { id: kundeId } = await kunden.erstelleKunde(AKTEUR, {
      firmenname: `Testkunde ${randomUUID().slice(0, 8)}`,
      ustId: 'DE123456789',
      land: 'DE',
    });
    await kunden.aendereKundeStatus(AKTEUR, kundeId, 'in_pruefung');
    await kunden.aendereKundeStatus(AKTEUR, kundeId, 'freigegeben');
    expect((await kunden.holeKunde(kundeId)).status).toBe('freigegeben');

    // Fahrzeug (Klasse B)
    const { id: fahrzeugId } = await fahrzeuge.erstelle(AKTEUR, {
      kennzeichen: `KF-${randomUUID().slice(0, 8)}`,
      zulGesamtmasseKg: 3500,
      benoetigteFuehrerscheinklasse: 'B',
      hatFahrtenschreiber: false,
    });

    // Fahrer: Klasse B, gültig, noch nicht freigegeben
    const { id: fahrerId } = await kunden.erstelleFahrer(AKTEUR, kundeId, {
      name: 'Erika Mustermann',
      fuehrerscheinKlasse: 'B',
      fuehrerscheinGueltigBis: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    });

    // Noch nicht einsatzbereit (Status angelegt)
    expect((await kunden.einsatzbereit(fahrerId, fahrzeugId, new Date())).einsatzbereit).toBe(
      false,
    );

    // Freigeben: angelegt -> identitaet_pruefung -> freigegeben
    await kunden.aendereFahrerStatus(AKTEUR, fahrerId, 'identitaet_pruefung');
    await kunden.aendereFahrerStatus(AKTEUR, fahrerId, 'freigegeben');

    // Jetzt einsatzbereit
    expect((await kunden.einsatzbereit(fahrerId, fahrzeugId, new Date())).einsatzbereit).toBe(true);

    // Sperre -> nicht mehr einsatzbereit
    await kunden.aendereFahrerStatus(AKTEUR, fahrerId, 'gesperrt');
    expect((await kunden.einsatzbereit(fahrerId, fahrzeugId, new Date())).einsatzbereit).toBe(
      false,
    );
  });

  it('verweigert einen unerlaubten Kunde-Statusübergang', async () => {
    const { id } = await kunden.erstelleKunde(AKTEUR, { firmenname: 'X', land: 'DE' });
    await expect(kunden.aendereKundeStatus(AKTEUR, id, 'freigegeben')).rejects.toThrow();
  });

  it('listet fällige Führerscheine (abgelaufen)', async () => {
    const { id: kundeId } = await kunden.erstelleKunde(AKTEUR, { firmenname: 'Y', land: 'DE' });
    const { id: fahrerId } = await kunden.erstelleFahrer(AKTEUR, kundeId, {
      name: 'Max Abgelaufen',
      fuehrerscheinKlasse: 'B',
      fuehrerscheinGueltigBis: new Date('2020-01-01T00:00:00Z').toISOString(),
    });
    const faellig = await kunden.faelligeFuehrerscheine(undefined, new Date());
    expect(faellig.some((f) => f.fahrerId === fahrerId)).toBe(true);
  });
});
