/**
 * Integrationstest Buchung/Miete gegen die echte DB. Nur mit RUN_INTEGRATION=1.
 * Deckt Buchungsregeln, Idempotenz, Doppelbuchung, Lebenszyklus und den an die
 * Miete gebundenen Temperaturnachweis ab.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@rent2cool/shared';
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
import { MieteService } from './miete.service';

/** Ausführender für Statuswechsel (Audit-Pflicht). */
const AKTEUR: Principal = { akteurId: 'test-integration', rollen: ['admin'] };
const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ?? 'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool';

describe.skipIf(!RUN)('Buchung/Miete (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;
  let mieten: MieteService;
  let fahrzeuge: FahrzeugService;
  let kunden: KundeService;

  async function bereitesFahrzeug(tacho: boolean): Promise<string> {
    const { id } = await fahrzeuge.erstelle(AKTEUR, {
      kennzeichen: `M-${randomUUID().slice(0, 8)}`,
      zulGesamtmasseKg: 3500,
      benoetigteFuehrerscheinklasse: 'B',
      hatFahrtenschreiber: tacho,
      aggregat: {
        typ: 'Kuehlaufbau',
        sensoren: [{ messgroesse: 'temperatur_laderaum', einheit: 'C' }],
      },
    });
    await fahrzeuge.aendereStatus(AKTEUR, id, 'verfuegbar');
    const akte = await fahrzeuge.holeAkte(id);
    const sensorId = akte.aggregate[0]!.sensoren[0]!.id;
    await fahrzeuge.fuegeKalibrierungHinzu(AKTEUR, sensorId, {
      durchgefuehrtAm: new Date().toISOString(),
      gueltigBis: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    });
    return id;
  }

  async function freigegebenerKunde(): Promise<string> {
    const { id } = await kunden.erstelleKunde(AKTEUR, {
      firmenname: `K ${randomUUID().slice(0, 6)}`,
      land: 'DE',
    });
    await kunden.aendereKundeStatus(AKTEUR, id, 'in_pruefung');
    await kunden.aendereKundeStatus(AKTEUR, id, 'freigegeben');
    return id;
  }

  async function freigegebenerFahrer(kundeId: string): Promise<string> {
    const { id } = await kunden.erstelleFahrer(AKTEUR, kundeId, {
      name: 'Fahrer Test',
      fuehrerscheinKlasse: 'B',
      fuehrerscheinGueltigBis: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    });
    await kunden.aendereFahrerStatus(AKTEUR, id, 'identitaet_pruefung');
    await kunden.aendereFahrerStatus(AKTEUR, id, 'freigegeben');
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
    await client.db
      .insert(mandant)
      .values({ id: PLACEHOLDER_MANDANT_ID, name: 'Test' })
      .onConflictDoNothing();
  });
  afterAll(async () => {
    await client.sql.end({ timeout: 5 });
  });

  const fenster = () => {
    const start = new Date(Date.now() + 3600_000);
    const ende = new Date(Date.now() + 2 * 3600_000);
    return { startGeplant: start.toISOString(), endeGeplant: ende.toISOString() };
  };

  it('lehnt Buchung ab, wenn der Kunde nicht freigegeben ist', async () => {
    const fahrzeugId = await bereitesFahrzeug(false);
    const { id: kundeId } = await kunden.erstelleKunde(AKTEUR, {
      firmenname: 'Nicht frei',
      land: 'DE',
    });
    await expect(
      mieten.erstelle(AKTEUR, { kundeId, fahrzeugId, auslandsfahrtGeplant: false, ...fenster() }),
    ).rejects.toThrow();
  });

  it('lehnt Auslandsfahrt ohne Fahrtenschreiber ab (D-006)', async () => {
    const fahrzeugId = await bereitesFahrzeug(false);
    const kundeId = await freigegebenerKunde();
    await expect(
      mieten.erstelle(AKTEUR, { kundeId, fahrzeugId, auslandsfahrtGeplant: true, ...fenster() }),
    ).rejects.toThrow();
  });

  it('bucht erfolgreich, ist idempotent und verhindert Doppelbuchung', async () => {
    const fahrzeugId = await bereitesFahrzeug(true);
    const kundeId = await freigegebenerKunde();
    const fahrerId = await freigegebenerFahrer(kundeId);
    const f = fenster();
    const key = `idem-${randomUUID()}`;

    const r1 = await mieten.erstelle(AKTEUR, {
      kundeId,
      fahrzeugId,
      fahrerId,
      auslandsfahrtGeplant: true, // Fahrzeug hat Tacho -> erlaubt
      idempotencyKey: key,
      ...f,
    });
    expect(r1.status).toBe('bestaetigt');
    expect(r1.idempotent).toBe(false);

    // Gleicher Key -> dieselbe Miete (idempotent).
    const r2 = await mieten.erstelle(AKTEUR, {
      kundeId,
      fahrzeugId,
      fahrerId,
      auslandsfahrtGeplant: true,
      idempotencyKey: key,
      ...f,
    });
    expect(r2.idempotent).toBe(true);
    expect(r2.id).toBe(r1.id);

    // Überlappende Buchung ohne Key -> abgelehnt (Doppelbuchung).
    await expect(
      mieten.erstelle(AKTEUR, { kundeId, fahrzeugId, fahrerId, auslandsfahrtGeplant: true, ...f }),
    ).rejects.toThrow();
  });

  it('führt den Status-Lebenszyklus bis abgerechnet', async () => {
    const fahrzeugId = await bereitesFahrzeug(false);
    const kundeId = await freigegebenerKunde();
    const r = await mieten.erstelle(AKTEUR, {
      kundeId,
      fahrzeugId,
      auslandsfahrtGeplant: false,
      ...fenster(),
    });
    await mieten.aendereStatus(AKTEUR, r.id, 'aktiv');
    await mieten.aendereStatus(AKTEUR, r.id, 'beendet');
    await mieten.aendereStatus(AKTEUR, r.id, 'abgerechnet');
    const m = await mieten.holeMiete(r.id);
    expect(m.status).toBe('abgerechnet');
    expect(m.startIst).not.toBeNull();
    expect(m.endeIst).not.toBeNull();
    await expect(mieten.aendereStatus(AKTEUR, r.id, 'aktiv')).rejects.toThrow(); // abgerechnet ist Endzustand
  });

  it('liefert den Temperaturnachweis gebunden an die Miete', async () => {
    const fahrzeugId = await bereitesFahrzeug(false);
    const kundeId = await freigegebenerKunde();
    const start = new Date(Date.now() - 3600_000); // Fenster in der Vergangenheit
    const ende = new Date();
    // Keine Statusänderung -> startIst/endeIst bleiben leer -> geplantes Fenster gilt.
    const r = await mieten.erstelle(AKTEUR, {
      kundeId,
      fahrzeugId,
      auslandsfahrtGeplant: false,
      temperaturprofil: '2-8',
      startGeplant: start.toISOString(),
      endeGeplant: ende.toISOString(),
    });
    for (let i = 0; i < 3; i++) {
      const zeit = new Date(start.getTime() + i * 60_000).toISOString();
      await client.sql`insert into messwert (zeit, fahrzeug_id, messgroesse, wert, einheit, nachricht_id, quelle)
        values (${zeit}, ${fahrzeugId}, 'temperatur_laderaum', ${4 + i}, 'C', ${randomUUID()}, 'test')`;
    }
    const nachweis = await mieten.temperaturnachweis(r.id);
    expect(nachweis.kennzahlen.anzahl).toBe(3);
    expect(nachweis.integritaet.signatur).toMatch(/^[0-9a-f]+$/);
  });
});
