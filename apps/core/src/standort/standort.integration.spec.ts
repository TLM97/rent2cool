/**
 * Integrationstest Standorte (D-011) gegen die echte DB: Anlegen/Ändern mit
 * Audit und Versionsschutz, eindeutiger Name, Deaktivieren nur ohne Nutzung,
 * Heimatstandort am Fahrzeug, Standorte in Buchungsprüfung und Fahrzeugsuche,
 * Mandantentrennung. Eigener Mandant je Lauf. Nur mit RUN_INTEGRATION=1.
 */
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@rent2cool/shared';
import { BerichtService } from '../bericht/bericht.service';
import { KonfigProfilQuelle } from '../bericht/profil';
import { JsonNachweisRenderer, RendererRegistry } from '../bericht/renderer';
import { HmacSignierer } from '../bericht/signierer';
import { InMemoryBerichtSpeicher } from '../bericht/speicher';
import { createDbClient } from '../db/client';
import { auditEvent, mandant } from '../db/schema';
import { FahrzeugService } from '../fahrzeug/fahrzeug.service';
import { KundeService } from '../kunde/kunde.service';
import { MieteService } from '../miete/miete.service';
import { StandortService } from './standort.service';

const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ??
  'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool_test';
const TAG = 86_400_000;

describe.skipIf(!RUN)('Standorte (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;
  let standorte: StandortService;
  let fahrzeuge: FahrzeugService;
  let kunden: KundeService;
  let mieten: MieteService;
  const mandantId = randomUUID();
  const admin: Principal = {
    akteurId: `test-standort-${randomUUID().slice(0, 8)}`,
    rollen: ['admin'],
    mandantId,
    name: 'admin.test',
  };

  const version = async (id: string) =>
    (await standorte.hole(mandantId, id)).aktualisiertAm.toISOString();

  async function kalibriertesFahrzeug(standortId?: string) {
    const { id } = await fahrzeuge.erstelle(admin, {
      kennzeichen: `ST-${randomUUID().slice(0, 8)}`,
      zulGesamtmasseKg: 3500,
      benoetigteFuehrerscheinklasse: 'B',
      hatFahrtenschreiber: false,
      standortId,
      aggregat: { sensoren: [{ messgroesse: 'temperatur_laderaum', einheit: 'C' }] },
    });
    const sensorId = (await fahrzeuge.holeAkte(id)).aggregate[0]!.sensoren[0]!.id;
    await fahrzeuge.fuegeKalibrierungHinzu(admin, sensorId, {
      durchgefuehrtAm: new Date().toISOString(),
      gueltigBis: new Date(Date.now() + 365 * TAG).toISOString(),
    });
    await fahrzeuge.aendereStatus(admin, id, 'verfuegbar');
    return id;
  }

  beforeAll(async () => {
    client = createDbClient(url);
    standorte = new StandortService(client.db);
    fahrzeuge = new FahrzeugService(client.db);
    kunden = new KundeService(client.db);
    mieten = new MieteService(
      client.db,
      fahrzeuge,
      kunden,
      new BerichtService(
        client.db,
        new KonfigProfilQuelle(),
        new HmacSignierer('test'),
        new RendererRegistry([new JsonNachweisRenderer()]),
        new InMemoryBerichtSpeicher(),
      ),
    );
    await client.db.insert(mandant).values({ id: mandantId, name: 'Test-Mandant Standorte' });
  });
  afterAll(async () => {
    await client.sql.end({ timeout: 5 });
  });

  it('anlegen und ändern mit Audit, Öffnungsregeln und Versionsschutz; Name eindeutig', async () => {
    const { id } = await standorte.erstelle(admin, {
      name: 'Nord',
      ort: 'Musterstadt',
      land: 'DE',
      geofenceLat: 51.2,
      geofenceLng: 10.4,
      geofenceRadiusM: 300,
      oeffnungsregeln: {
        zeitzone: 'Europe/Berlin',
        woche: { mo: [{ von: '06:00', bis: '22:00' }] },
      },
    });
    const s = await standorte.hole(mandantId, id);
    expect(s).toMatchObject({ name: 'Nord', aktiv: true, geofenceRadiusM: 300 });
    expect(s.oeffnungsregeln?.woche.mo).toEqual([{ von: '06:00', bis: '22:00' }]);

    await expect(standorte.erstelle(admin, { name: 'Nord', land: 'DE' })).rejects.toThrow(
      ConflictException,
    );

    // Gleiche Öffnungszeiten erneut speichern: keine Änderung (jsonb ordnet Schlüssel um).
    const gleich = await standorte.aendere(admin, id, {
      version: await version(id),
      oeffnungsregeln: {
        zeitzone: 'Europe/Berlin',
        woche: { mo: [{ von: '06:00', bis: '22:00' }] },
      },
    });
    expect(gleich.geaendert).toEqual([]);

    const v1 = await version(id);
    const r = await standorte.aendere(admin, id, {
      version: v1,
      ort: 'Beispielstadt',
      oeffnungsregeln: null,
    });
    expect(r.geaendert).toEqual(['ort', 'oeffnungsregeln']);
    await expect(standorte.aendere(admin, id, { version: v1, ort: 'X' })).rejects.toThrow(
      ConflictException,
    );

    const audit = await client.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.entitaetId, id), eq(auditEvent.entitaetTyp, 'standort')));
    expect(audit.map((a) => a.aktion).sort()).toEqual(['PATCH', 'POST']);
    expect(audit.find((a) => a.aktion === 'PATCH')).toMatchObject({
      altWert: { ort: 'Musterstadt', oeffnungsregeln: { zeitzone: 'Europe/Berlin' } },
      neuWert: { ort: 'Beispielstadt', oeffnungsregeln: null },
    });

    const fremd: Principal = { akteurId: 'fremd', rollen: ['admin'], mandantId: randomUUID() };
    await expect(standorte.hole(fremd.mandantId, id)).rejects.toThrow(NotFoundException);
  });

  it('deaktivieren nur ohne Fahrzeuge; deaktivierter Standort ist nicht zuordenbar', async () => {
    const { id } = await standorte.erstelle(admin, { name: 'Süd', land: 'DE' });
    const fahrzeugId = await kalibriertesFahrzeug(id);
    await expect(
      standorte.aendere(admin, id, { version: await version(id), aktiv: false }),
    ).rejects.toThrow(ConflictException);

    // Fahrzeug umziehen, dann deaktivierbar.
    const akte = await fahrzeuge.holeAkte(fahrzeugId);
    await fahrzeuge.aendere(admin, fahrzeugId, {
      version: akte.fahrzeug.aktualisiertAm.toISOString(),
      standortId: null,
    });
    await standorte.aendere(admin, id, { version: await version(id), aktiv: false });
    expect(
      (await standorte.liste(mandantId, { aktiv: false, limit: 10, offset: 0 })).eintraege.map(
        (x) => x.name,
      ),
    ).toContain('Süd');

    await expect(kalibriertesFahrzeug(id)).rejects.toThrow(BadRequestException);
  });

  it('Buchung prüft Abhol- und Rückgabestandort; Suche filtert nach Heimatstandort', async () => {
    const { id: aktivId } = await standorte.erstelle(admin, { name: 'Ost', land: 'DE' });
    const { id: zuId } = await standorte.erstelle(admin, { name: 'West', land: 'DE' });
    await standorte.aendere(admin, zuId, { version: await version(zuId), aktiv: false });
    const amStandort = await kalibriertesFahrzeug(aktivId);
    await kalibriertesFahrzeug(); // ohne Heimatstandort

    const { id: kundeId } = await kunden.erstelleKunde(admin, {
      firmenname: 'Standortkunde',
      land: 'DE',
    });
    const von = new Date(Date.now() + 2 * TAG);
    const bis = new Date(Date.now() + 3 * TAG);
    const basis = {
      kundeId,
      fahrzeugId: amStandort,
      auslandsfahrtGeplant: false,
      startGeplant: von,
      endeGeplant: bis,
    };
    expect(
      await mieten.pruefeBuchung(mandantId, {
        ...basis,
        standortAbholId: aktivId,
        standortRueckgabeId: zuId,
      }),
    ).toContain('Rückgabe: Standort „West“ ist deaktiviert');
    expect(
      await mieten.pruefeBuchung(mandantId, { ...basis, standortAbholId: randomUUID() }),
    ).toContain('Abholung: Standort nicht gefunden');

    const treffer = await fahrzeuge.sucheVerfuegbare(mandantId, {
      von,
      bis,
      standortId: aktivId,
      limit: 20,
      offset: 0,
    });
    expect(treffer.eintraege.map((f) => f.id)).toEqual([amStandort]);
    expect(
      (await fahrzeuge.liste(mandantId, { standortId: aktivId, limit: 10, offset: 0 }))
        .eintraege[0],
    ).toMatchObject({
      id: amStandort,
      standortName: 'Ost',
    });
  });
});
