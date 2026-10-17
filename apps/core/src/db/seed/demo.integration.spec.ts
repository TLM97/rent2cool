/**
 * Integrationstest Demo-Daten gegen die echte DB: Laden in einen eigenen
 * Mandanten, fachliche Stimmigkeit (Nachweise, Alarme, Rechnungen, Status),
 * Audit-Akteur und einmaliges Laden. Nur mit RUN_INTEGRATION=1.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BerichtService } from '../../bericht/bericht.service';
import { KonfigProfilQuelle } from '../../bericht/profil';
import { JsonNachweisRenderer, RendererRegistry } from '../../bericht/renderer';
import { HmacSignierer } from '../../bericht/signierer';
import { InMemoryBerichtSpeicher } from '../../bericht/speicher';
import { FahrzeugService } from '../../fahrzeug/fahrzeug.service';
import { KundeService } from '../../kunde/kunde.service';
import { MieteService } from '../../miete/miete.service';
import { createDbClient } from '../client';
import { abweichung, alarm, auditEvent, fahrzeug, miete, rechnung } from '../schema';
import { DEMO_AKTEUR_ID } from './demo-daten';
import { ladeDemoDaten, type DemoErgebnis } from './demo';

const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ?? 'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool';

describe.skipIf(!RUN)('Demo-Daten (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;
  let mieten: MieteService;
  let ergebnis: DemoErgebnis;
  const mandantId = randomUUID();

  beforeAll(async () => {
    client = createDbClient(url);
    const fahrzeuge = new FahrzeugService(client.db);
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
    ergebnis = await ladeDemoDaten(client.db, { mandantId });
  }, 120_000);
  afterAll(async () => {
    await client.sql.end({ timeout: 5 });
  });

  it('legt Fahrzeuge, Kunden, Fahrer, Mieten, Messwerte, Alarme und Rechnungen an', () => {
    expect(ergebnis).toMatchObject({
      bereitsVorhanden: false,
      fahrzeuge: 5,
      kunden: 3,
      fahrer: 3,
      mieten: 6,
      rechnungen: 3,
    });
    expect(ergebnis.messwerte).toBeGreaterThan(5000);
    expect(ergebnis.alarme).toBeGreaterThan(0);
  });

  it('Temperaturnachweise: eingehalten, Ausreißer als verletzt erkannt', async () => {
    const alle = await client.db.select().from(miete).where(eq(miete.mandantId, mandantId));
    const beendet = alle.filter((m) => m.status === 'beendet' || m.status === 'abgerechnet');
    expect(beendet).toHaveLength(3);
    const bewertungen = await Promise.all(
      beendet.map(async (m) => (await mieten.temperaturnachweis(m.id)).bewertung),
    );
    expect(bewertungen.sort()).toEqual(['eingehalten', 'eingehalten', 'verletzt']);
    expect(alle.filter((m) => m.status === 'aktiv')).toHaveLength(1);
    expect(alle.filter((m) => m.status === 'bestaetigt')).toHaveLength(2);
  });

  it('Alarme: abgeschlossener Ausreißer bearbeitet, laufende Miete hat offene Alarme', async () => {
    const alarme = await client.db.select().from(alarm).where(eq(alarm.mandantId, mandantId));
    expect(alarme.some((a) => a.status === 'offen')).toBe(true);
    expect(
      alarme.some((a) => a.status === 'geschlossen' && a.quittiertVon === DEMO_AKTEUR_ID),
    ).toBe(true);
    const [abw] = await client.db
      .select()
      .from(abweichung)
      .where(eq(abweichung.mandantId, mandantId));
    expect(abw).toMatchObject({ status: 'geschlossen', verantwortlich: 'QA (Demo)' });
  });

  it('Rechnungen und Fahrzeugstatus wie im Szenario', async () => {
    const r = await client.db.select().from(rechnung).where(eq(rechnung.mandantId, mandantId));
    expect(r.map((x) => x.status).sort()).toEqual(['bezahlt', 'entwurf', 'gestellt']);
    const fz = await client.db.select().from(fahrzeug).where(eq(fahrzeug.mandantId, mandantId));
    expect(fz.map((f) => f.status).sort()).toEqual([
      'verfuegbar',
      'verfuegbar',
      'verfuegbar',
      'vermietet',
      'wartung',
    ]);
  });

  it('alles steht mit dem Akteur „Demo-Daten“ im Audit Trail', async () => {
    const ids = (
      await client.db.select({ id: miete.id }).from(miete).where(eq(miete.mandantId, mandantId))
    ).map((m) => m.id);
    const eintraege = await client.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.entitaetTyp, 'miete'), inArray(auditEvent.entitaetId, ids)));
    expect(eintraege).toHaveLength(6);
    expect(
      eintraege.every((e) => e.akteurId === DEMO_AKTEUR_ID && e.akteurName === 'Demo-Daten'),
    ).toBe(true);
  });

  it('ein zweiter Lauf ändert nichts', async () => {
    const vorher = await client.db
      .select({ id: miete.id })
      .from(miete)
      .where(eq(miete.mandantId, mandantId));
    expect((await ladeDemoDaten(client.db, { mandantId })).bereitsVorhanden).toBe(true);
    const nachher = await client.db
      .select({ id: miete.id })
      .from(miete)
      .where(eq(miete.mandantId, mandantId));
    expect(nachher).toHaveLength(vorher.length);
  });
});
