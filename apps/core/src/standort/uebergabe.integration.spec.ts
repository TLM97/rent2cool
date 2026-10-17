/**
 * Integrationstest Übergabebereich (D-011, D-014) gegen die echte DB: letzte
 * Position aus der Telematik (begrenzt, Breite/Länge aus derselben Nachricht),
 * Prüfung gegen den Geofence, Festhalten bei Übergabe und Rückgabe (mit Audit),
 * Mandantentrennung. Eigener Mandant je Lauf. Nur mit RUN_INTEGRATION=1.
 */
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal, TelemetrieNachricht } from '@rent2cool/shared';
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
import { verarbeiteNachricht } from '../telemetry/processor';
import { StandortService } from './standort.service';
import { letztePosition, pruefeUebergabe } from './uebergabe';

const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ??
  'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool_test';
const MIN = 60_000;
const ZENTRUM = { lat: 51.2, lng: 10.4 };
/** ~111 m je 1/1000 Grad Breite. */
const nord = (meter: number) => ({
  lat: Number((ZENTRUM.lat + meter / 111_320).toFixed(6)),
  lng: ZENTRUM.lng,
});

describe.skipIf(!RUN)('Übergabebereich (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;
  let fahrzeuge: FahrzeugService;
  let mieten: MieteService;
  let standortId: string;
  let ohneGeofenceId: string;
  const mandantId = randomUUID();
  const ops: Principal = {
    akteurId: `test-uebergabe-${randomUUID().slice(0, 8)}`,
    rollen: ['admin'],
    mandantId,
  };

  async function sende(
    fahrzeugId: string,
    zeit: Date,
    p: { lat: number; lng: number },
    extra = false,
  ) {
    const n: TelemetrieNachricht = {
      nachrichtId: `test-pos-${randomUUID()}`,
      fahrzeugId,
      quelle: 'test',
      gesendetAm: zeit.toISOString(),
      messwerte: [
        { messgroesse: 'position_lat', wert: p.lat, einheit: 'grad' },
        { messgroesse: 'position_lng', wert: p.lng, einheit: 'grad' },
        ...(extra ? [{ messgroesse: 'temperatur_laderaum', wert: 5, einheit: 'C' }] : []),
      ],
    };
    await verarbeiteNachricht(client.db, n);
  }

  async function fahrzeug(standort?: string) {
    const { id } = await fahrzeuge.erstelle(ops, {
      kennzeichen: `UE-${randomUUID().slice(0, 8)}`,
      zulGesamtmasseKg: 3500,
      benoetigteFuehrerscheinklasse: 'B',
      hatFahrtenschreiber: false,
      standortId: standort,
      aggregat: { sensoren: [{ messgroesse: 'temperatur_laderaum', einheit: 'C' }] },
    });
    return id;
  }

  beforeAll(async () => {
    client = createDbClient(url);
    fahrzeuge = new FahrzeugService(client.db);
    const kunden = new KundeService(client.db);
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
    await client.db.insert(mandant).values({ id: mandantId, name: 'Test-Mandant Übergabe' });
    const standorte = new StandortService(client.db);
    ({ id: standortId } = await standorte.erstelle(ops, {
      name: 'Übergabe-Test',
      land: 'DE',
      geofenceLat: ZENTRUM.lat,
      geofenceLng: ZENTRUM.lng,
      geofenceRadiusM: 300,
    }));
    ({ id: ohneGeofenceId } = await standorte.erstelle(ops, { name: 'Ohne Geofence', land: 'DE' }));
  });
  afterAll(async () => {
    await client.sql.end({ timeout: 5 });
  });

  it('letzte Position: jüngste bis zum Zeitpunkt, nicht älter als 24 h', async () => {
    const id = await fahrzeug(standortId);
    const jetzt = new Date();
    expect(await letztePosition(client.db, id, jetzt)).toBeNull();
    await sende(id, new Date(jetzt.getTime() - 30 * MIN), nord(1000), true);
    await sende(id, new Date(jetzt.getTime() - 5 * MIN), nord(100));
    await sende(id, new Date(jetzt.getTime() - 25 * 60 * MIN), nord(5000));
    expect(await letztePosition(client.db, id, jetzt)).toMatchObject(nord(100));
    expect(await letztePosition(client.db, id, new Date(jetzt.getTime() - 10 * MIN))).toMatchObject(
      nord(1000),
    );
    // Ein Fahrzeug, dessen letzte Position 25 h alt ist: außerhalb des Suchfensters → keine.
    const still = await fahrzeug(standortId);
    await sende(still, new Date(jetzt.getTime() - 25 * 60 * MIN), nord(10));
    expect(await letztePosition(client.db, still, jetzt)).toBeNull();
  });

  it('Prüfung gegen den Geofence: im Bereich, außerhalb, unbekannt', async () => {
    const id = await fahrzeug(standortId);
    const jetzt = new Date();
    expect((await pruefeUebergabe(client.db, mandantId, id, standortId, jetzt)).grund).toBe(
      'Keine Position empfangen',
    );
    await sende(id, new Date(jetzt.getTime() - 2 * MIN), nord(120));
    const nah = await pruefeUebergabe(client.db, mandantId, id, standortId, jetzt);
    expect(nah.ergebnis).toBe('im_bereich');
    expect(Math.abs(nah.abstandM! - 120)).toBeLessThanOrEqual(2);
    expect((await pruefeUebergabe(client.db, mandantId, id, ohneGeofenceId, jetzt)).grund).toBe(
      'Standort ohne Geofence',
    );
    // Standort eines anderen Mandanten zählt nicht.
    expect((await pruefeUebergabe(client.db, randomUUID(), id, standortId, jetzt)).grund).toBe(
      'Kein Standort festgelegt',
    );
    await sende(id, new Date(jetzt.getTime() - MIN), nord(2000));
    const weit = (await fahrzeuge.positionUndBereich(mandantId, id)).pruefung;
    expect(weit.ergebnis).toBe('ausserhalb');
    expect(Math.abs(weit.abstandM! - 2000)).toBeLessThanOrEqual(2);
    await expect(fahrzeuge.positionUndBereich(randomUUID(), id)).rejects.toThrow(NotFoundException);
  });

  it('Übergabe und Rückgabe werden mit dem Statuswechsel festgehalten (und auditiert)', async () => {
    const id = await fahrzeug(standortId);
    const { id: mieteId } = await client.db.transaction(async (tx) => {
      const { miete } = await import('../db/schema');
      const { kunde } = await import('../db/schema');
      const [k] = await tx
        .insert(kunde)
        .values({ mandantId, firmenname: 'Ü-Kunde', status: 'freigegeben' })
        .returning();
      const [m] = await tx
        .insert(miete)
        .values({
          mandantId,
          kundeId: k!.id,
          fahrzeugId: id,
          standortAbholId: standortId,
          standortRueckgabeId: standortId,
          startGeplant: new Date(Date.now() - 60 * MIN),
          endeGeplant: new Date(Date.now() + 60 * MIN),
          status: 'bestaetigt',
        })
        .returning();
      return m!;
    });
    await sende(id, new Date(Date.now() - MIN), nord(50));
    await mieten.aendereStatus(ops, mieteId, 'aktiv');
    await sende(id, new Date(), nord(900));
    await mieten.aendereStatus(ops, mieteId, 'beendet');

    const m = await mieten.holeMiete(mieteId);
    expect(m.uebergabePruefung).toMatchObject({ ergebnis: 'im_bereich', standortId });
    expect(m.rueckgabePruefung).toMatchObject({ ergebnis: 'ausserhalb', standortId });
    // Koordinaten sind auf 6 Nachkommastellen gerundet → ±2 m
    expect(Math.abs(m.rueckgabePruefung!.abstandM! - 900)).toBeLessThanOrEqual(2);

    const audit = await client.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.entitaetId, mieteId), eq(auditEvent.entitaetTyp, 'miete_status')));
    expect(
      audit.find((a) => (a.neuWert as { status: string }).status === 'beendet')?.neuWert,
    ).toMatchObject({
      rueckgabePruefung: { ergebnis: 'ausserhalb' },
    });
  });
});
