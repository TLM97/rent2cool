/**
 * Integrationstest Rechnung gegen die echte DB. Nur mit RUN_INTEGRATION=1.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@rent2cool/shared';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { createDbClient } from '../db/client';
import { mandant } from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';
import { FahrzeugService } from '../fahrzeug/fahrzeug.service';
import { KundeService } from '../kunde/kunde.service';
import { BerichtService } from '../bericht/bericht.service';
import { KonfigProfilQuelle } from '../bericht/profil';
import { JsonNachweisRenderer, RendererRegistry } from '../bericht/renderer';
import { HmacSignierer } from '../bericht/signierer';
import { InMemoryBerichtSpeicher } from '../bericht/speicher';
import { MieteService } from '../miete/miete.service';
import { RechnungService } from './rechnung.service';

/** Ausführender für Statuswechsel (Audit-Pflicht). */
const AKTEUR: Principal = { akteurId: 'test-integration', rollen: ['admin'] };
const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ?? 'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool';

const fakeConfig = {
  get: (k: string) => (k === 'RECHNUNG_STEUERSATZ' ? 19 : 'EUR'),
} as unknown as ConfigService<Env, true>;

describe.skipIf(!RUN)('Rechnung (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;
  let fahrzeuge: FahrzeugService;
  let kunden: KundeService;
  let mieten: MieteService;
  let rechnungen: RechnungService;

  async function beendeteMiete(): Promise<string> {
    const { id: fahrzeugId } = await fahrzeuge.erstelle(undefined, {
      kennzeichen: `R-${randomUUID().slice(0, 8)}`,
      zulGesamtmasseKg: 3500,
      benoetigteFuehrerscheinklasse: 'B',
      hatFahrtenschreiber: false,
      aggregat: { sensoren: [{ messgroesse: 'temperatur_laderaum', einheit: 'C' }] },
    });
    await fahrzeuge.aendereStatus(AKTEUR, fahrzeugId, 'verfuegbar');
    const akte = await fahrzeuge.holeAkte(fahrzeugId);
    await fahrzeuge.fuegeKalibrierungHinzu(akte.aggregate[0]!.sensoren[0]!.id, 'tester', {
      durchgefuehrtAm: new Date().toISOString(),
      gueltigBis: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    });
    const { id: kundeId } = await kunden.erstelleKunde(undefined, { firmenname: 'RK', land: 'DE' });
    await kunden.aendereKundeStatus(AKTEUR, kundeId, 'in_pruefung');
    await kunden.aendereKundeStatus(AKTEUR, kundeId, 'freigegeben');
    const r = await mieten.erstelle(undefined, {
      kundeId,
      fahrzeugId,
      auslandsfahrtGeplant: false,
      startGeplant: new Date(Date.now() + 3600_000).toISOString(),
      endeGeplant: new Date(Date.now() + 7200_000).toISOString(),
    });
    await mieten.aendereStatus(AKTEUR, r.id, 'aktiv');
    await mieten.aendereStatus(AKTEUR, r.id, 'beendet');
    return r.id;
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
    await client.db.insert(mandant).values({ id: PLACEHOLDER_MANDANT_ID, name: 'Test' }).onConflictDoNothing();
  });
  afterAll(async () => {
    await client.sql.end({ timeout: 5 });
  });

  it('erstellt Rechnung aus beendeter Miete mit korrekter Steuer und Nummer', async () => {
    const mieteId = await beendeteMiete();
    const r = await rechnungen.erstelle(undefined, { mieteId, netto: 100 });
    expect(r.nettoCent).toBe(10000);
    expect(r.steuerCent).toBe(1900);
    expect(r.bruttoCent).toBe(11900);
    expect(r.waehrung).toBe('EUR');
    expect(r.rechnungsnummer).toMatch(/^\d{4}-\d{5}$/);
    expect(r.status).toBe('entwurf');

    // Zweite Rechnung zur selben Miete -> Konflikt.
    await expect(rechnungen.erstelle(undefined, { mieteId, netto: 50 })).rejects.toThrow();

    // Liste lässt sich nach Miete filtern (für die Mietseite der Oberfläche).
    const zurMiete = await rechnungen.liste(undefined, { mieteId, limit: 10, offset: 0 });
    expect(zurMiete.gesamt).toBe(1);
    expect(zurMiete.eintraege[0]!.id).toBe(r.id);

    // Stellen -> Miete wird abgerechnet; dann bezahlt.
    await rechnungen.aendereStatus(AKTEUR, r.id, 'gestellt');
    expect((await mieten.holeMiete(mieteId)).status).toBe('abgerechnet');
    await rechnungen.aendereStatus(AKTEUR, r.id, 'bezahlt');
    expect((await rechnungen.holeRechnung(r.id)).status).toBe('bezahlt');
  });

  it('lehnt Rechnung für eine nicht beendete Miete ab', async () => {
    const { id: fahrzeugId } = await fahrzeuge.erstelle(undefined, {
      kennzeichen: `R-${randomUUID().slice(0, 8)}`,
      zulGesamtmasseKg: 3500,
      benoetigteFuehrerscheinklasse: 'B',
      hatFahrtenschreiber: false,
      aggregat: { sensoren: [{ messgroesse: 'temperatur_laderaum', einheit: 'C' }] },
    });
    await fahrzeuge.aendereStatus(AKTEUR, fahrzeugId, 'verfuegbar');
    const akte = await fahrzeuge.holeAkte(fahrzeugId);
    await fahrzeuge.fuegeKalibrierungHinzu(akte.aggregate[0]!.sensoren[0]!.id, 'tester', {
      durchgefuehrtAm: new Date().toISOString(),
      gueltigBis: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    });
    const { id: kundeId } = await kunden.erstelleKunde(undefined, { firmenname: 'RK2', land: 'DE' });
    await kunden.aendereKundeStatus(AKTEUR, kundeId, 'in_pruefung');
    await kunden.aendereKundeStatus(AKTEUR, kundeId, 'freigegeben');
    const r = await mieten.erstelle(undefined, {
      kundeId,
      fahrzeugId,
      auslandsfahrtGeplant: false,
      startGeplant: new Date(Date.now() + 3600_000).toISOString(),
      endeGeplant: new Date(Date.now() + 7200_000).toISOString(),
    }); // Status bestaetigt (nicht beendet)
    await expect(rechnungen.erstelle(undefined, { mieteId: r.id, netto: 100 })).rejects.toThrow();
  });

  it('vergibt fortlaufende Rechnungsnummern', async () => {
    const r1 = await rechnungen.erstelle(undefined, { mieteId: await beendeteMiete(), netto: 10 });
    const r2 = await rechnungen.erstelle(undefined, { mieteId: await beendeteMiete(), netto: 20 });
    const n1 = Number(r1.rechnungsnummer.split('-')[1]);
    const n2 = Number(r2.rechnungsnummer.split('-')[1]);
    expect(n2).toBe(n1 + 1);
  });
});
