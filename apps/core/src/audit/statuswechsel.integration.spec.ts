/**
 * Integrationstest Statuswechsel gegen die echte DB: Audit mit altem und neuem
 * Wert, Zeilensperre bei gleichzeitigen Wechseln, Folgeschritt in derselben
 * Transaktion (Rechnung gestellt → Miete abgerechnet), Mandantentrennung.
 * Nur mit RUN_INTEGRATION=1.
 */
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { and, asc, eq } from 'drizzle-orm';
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
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';
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

describe.skipIf(!RUN)('Statuswechsel mit Audit (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;
  let fahrzeuge: FahrzeugService;
  let kunden: KundeService;
  let mieten: MieteService;
  let rechnungen: RechnungService;
  let abweichungen: AbweichungService;
  const ops: Principal = {
    akteurId: `test-status-${randomUUID().slice(0, 8)}`,
    rollen: ['ops', 'qa_approver'],
    name: 'ops.test',
  };
  const fremd: Principal = { akteurId: 'test-fremd', rollen: ['ops'], mandantId: randomUUID() };

  async function audit(entitaetId: string, typ: string) {
    return client.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.entitaetId, entitaetId), eq(auditEvent.entitaetTyp, typ)))
      .orderBy(asc(auditEvent.zeit));
  }

  /** Bestätigte Miete auf einem kalibrierten Fahrzeug eines freigegebenen Kunden. */
  async function bestaetigteMiete(): Promise<string> {
    const { id: fahrzeugId } = await fahrzeuge.erstelle(ops, {
      kennzeichen: `ST-${randomUUID().slice(0, 8)}`,
      zulGesamtmasseKg: 3500,
      benoetigteFuehrerscheinklasse: 'B',
      hatFahrtenschreiber: false,
      aggregat: { sensoren: [{ messgroesse: 'temperatur_laderaum', einheit: 'C' }] },
    });
    await fahrzeuge.aendereStatus(ops, fahrzeugId, 'verfuegbar');
    const sensorId = (await fahrzeuge.holeAkte(fahrzeugId)).aggregate[0]!.sensoren[0]!.id;
    await fahrzeuge.fuegeKalibrierungHinzu(ops, sensorId, {
      durchgefuehrtAm: new Date().toISOString(),
      gueltigBis: new Date(Date.now() + 365 * 86_400_000).toISOString(),
    });
    const { id: kundeId } = await kunden.erstelleKunde(ops, { firmenname: 'Statuskunde', land: 'DE' });
    await kunden.aendereKundeStatus(ops, kundeId, 'in_pruefung');
    await kunden.aendereKundeStatus(ops, kundeId, 'freigegeben');
    const r = await mieten.erstelle(ops, {
      kundeId,
      fahrzeugId,
      auslandsfahrtGeplant: false,
      startGeplant: new Date(Date.now() + 3600_000).toISOString(),
      endeGeplant: new Date(Date.now() + 7200_000).toISOString(),
    });
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
    abweichungen = new AbweichungService(client.db);
    await client.db.insert(mandant).values({ id: PLACEHOLDER_MANDANT_ID, name: 'Test' }).onConflictDoNothing();
  });
  afterAll(async () => {
    await client.sql.end({ timeout: 5 });
  });

  it('protokolliert Status und Folgefelder mit altem und neuem Wert', async () => {
    const id = await bestaetigteMiete();
    const r = await mieten.aendereStatus(ops, id, 'aktiv');
    expect(r).toMatchObject({ status: 'aktiv', von: 'bestaetigt', geaendert: true });
    const startIst = (await mieten.holeMiete(id)).startIst!.toISOString();
    const [eintrag] = await audit(id, 'miete_status');
    expect(eintrag).toMatchObject({
      akteurId: ops.akteurId,
      altWert: { status: 'bestaetigt', startIst: null },
      neuWert: { status: 'aktiv', startIst },
    });

    // Lesbar im Verlauf (neueste zuerst), mit Anmeldename.
    const verlauf = await new AuditService(client.db).verlauf({
      entitaetIds: [id],
      typen: ['miete', 'miete_status'],
      limit: 10,
      offset: 0,
    });
    expect(verlauf.gesamt).toBe(2);
    expect(verlauf.eintraege[0]).toMatchObject({
      entitaetTyp: 'miete_status',
      akteurName: 'ops.test',
      akteurRolle: 'ops,qa_approver',
    });
    // Ältester Eintrag: das Anlegen mit der vollständigen Miete als neuem Wert.
    expect(verlauf.eintraege[1]).toMatchObject({
      entitaetTyp: 'miete',
      altWert: null,
      neuWert: { id, status: 'bestaetigt', auslandsfahrtGeplant: false },
    });

    // Gleicher Status nochmal → nichts geändert, kein weiterer Eintrag.
    expect((await mieten.aendereStatus(ops, id, 'aktiv')).geaendert).toBe(false);
    expect(await audit(id, 'miete_status')).toHaveLength(1);
  });

  it('gleichzeitig „aktiv“ und „storniert“ vom selben Stand: genau einer gewinnt', async () => {
    const id = await bestaetigteMiete();
    const ergebnisse = await Promise.allSettled([
      mieten.aendereStatus(ops, id, 'aktiv'),
      mieten.aendereStatus(ops, id, 'storniert'),
    ]);
    expect(ergebnisse.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    expect(ergebnisse.filter((e) => e.status === 'rejected')).toHaveLength(1);
    const eintraege = await audit(id, 'miete_status');
    expect(eintraege).toHaveLength(1);
    expect((await mieten.holeMiete(id)).status).toBe((eintraege[0]!.neuWert as { status: string }).status);
  });

  it('Rechnung stellen rechnet die Miete in derselben Transaktion ab – beides im Audit', async () => {
    const id = await bestaetigteMiete();
    await mieten.aendereStatus(ops, id, 'aktiv');
    await mieten.aendereStatus(ops, id, 'beendet');
    const rechnung = await rechnungen.erstelle(ops, { mieteId: id, netto: 100 });
    await rechnungen.aendereStatus(ops, rechnung.id, 'gestellt');

    expect((await mieten.holeMiete(id)).status).toBe('abgerechnet');
    const [r] = await audit(rechnung.id, 'rechnung_status');
    expect(r).toMatchObject({ altWert: { status: 'entwurf', gestelltAm: null }, neuWert: { status: 'gestellt' } });
    const m = await audit(id, 'miete_status');
    expect(m.at(-1)).toMatchObject({ altWert: { status: 'beendet' }, neuWert: { status: 'abgerechnet' } });
  });

  it('Abweichung: Feldänderung ohne Statuswechsel wird protokolliert', async () => {
    const { id } = await abweichungen.erstelle(ops, {
      bezugTyp: 'miete',
      bezugId: randomUUID(),
      beschreibung: 'Test',
    });
    await abweichungen.aendereStatus(ops, id, 'in_bewertung', {});
    await abweichungen.aendereStatus(ops, id, 'in_bewertung', { bewertung: 'Erste Einschätzung' });
    const eintraege = await audit(id, 'abweichung_status');
    expect(eintraege).toHaveLength(2);
    expect(eintraege[1]).toMatchObject({
      altWert: { status: 'in_bewertung', bewertung: null },
      neuWert: { status: 'in_bewertung', bewertung: 'Erste Einschätzung' },
    });
  });

  it('fremder Mandant kann keinen Status ändern', async () => {
    const id = await bestaetigteMiete();
    await expect(mieten.aendereStatus(fremd, id, 'storniert')).rejects.toThrow(NotFoundException);
    expect((await mieten.holeMiete(id)).status).toBe('bestaetigt');
  });
});
