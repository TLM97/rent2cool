/**
 * Integrationstest Datensichtbarkeit (F-41) gegen die echte DB: Kunden-Logins
 * sehen nur Daten ihres Kunden, interne Rollen nur ihren Mandanten; fremde
 * Datensätze sind „nicht gefunden“. Geprüft über den Zugriffsbaustein und über
 * die Controller selbst (so, wie die API antwortet). Nur mit RUN_INTEGRATION=1.
 */
import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@rent2cool/shared';
import { AlarmController, AbweichungController } from '../alarm/alarm.controller';
import { AbweichungService } from '../alarm/abweichung.service';
import { AlarmService } from '../alarm/alarm.service';
import { BerichtService } from '../bericht/bericht.service';
import { KonfigProfilQuelle } from '../bericht/profil';
import { standardRenderer } from '../bericht/renderer';
import { HmacSignierer } from '../bericht/signierer';
import { InMemoryBerichtSpeicher } from '../bericht/speicher';
import { createDbClient } from '../db/client';
import {
  abweichung,
  alarm,
  auditEvent,
  fahrzeug,
  kunde,
  mandant,
  miete,
  rechnung,
} from '../db/schema';
import { FahrzeugService } from '../fahrzeug/fahrzeug.service';
import { KundeController } from '../kunde/kunde.controller';
import { KundeService } from '../kunde/kunde.service';
import { MieteController } from '../miete/miete.controller';
import { MieteService } from '../miete/miete.service';
import { IchController } from './ich.controller';
import { Zugriff } from './zugriff';

const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ??
  'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool_test';
const STUNDE = 3600_000;

describe.skipIf(!RUN)('Datensichtbarkeit je Kunde (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;
  let zugriff: Zugriff;
  let kunden: KundeService;
  let mieten: MieteService;
  const mandantId = randomUUID();
  const fremderMandant = randomUUID();
  const admin: Principal = {
    akteurId: `test-zg-${randomUUID().slice(0, 8)}`,
    rollen: ['admin'],
    mandantId,
  };
  const kontoA = `konto-a-${randomUUID()}`;
  const kontoB = `konto-b-${randomUUID()}`;
  const kundeA: Principal = { akteurId: kontoA, rollen: ['kunde_dispo', 'kunde_qa'], mandantId };
  const kundeB: Principal = { akteurId: kontoB, rollen: ['kunde_qa'], mandantId };
  // Je Kunde: Miete, Alarm, Abweichung, Rechnung; dazu ein Fahrzeug ohne Mietbezug.
  const d = {} as Record<
    'a' | 'b',
    { kunde: string; miete: string; fahrzeug: string; alarm: string; abw: string; rechnung: string }
  > & { fremdFahrzeug: string; fremdMandantMiete: string };

  async function fahrzeugAnlegen(m = mandantId) {
    const [f] = await client.db
      .insert(fahrzeug)
      .values({
        mandantId: m,
        kennzeichen: `ZG-${randomUUID().slice(0, 8)}`,
        zulGesamtmasseKg: 3500,
        benoetigteFuehrerscheinklasse: 'B',
        hatFahrtenschreiber: false,
        status: 'verfuegbar',
      })
      .returning();
    return f!.id;
  }

  async function datenFuer(name: string, status: 'aktiv' | 'beendet') {
    const [k] = await client.db
      .insert(kunde)
      .values({ mandantId, firmenname: `ZG ${name} ${randomUUID()}`, status: 'freigegeben' })
      .returning();
    const fz = await fahrzeugAnlegen();
    const [m] = await client.db
      .insert(miete)
      .values({
        mandantId,
        kundeId: k!.id,
        fahrzeugId: fz,
        startGeplant: new Date(Date.now() - 48 * STUNDE),
        endeGeplant: new Date(Date.now() + 24 * STUNDE),
        startIst: new Date(Date.now() - 48 * STUNDE),
        status,
      })
      .returning();
    const [a] = await client.db
      .insert(alarm)
      .values({
        mandantId,
        fahrzeugId: fz,
        mieteId: m!.id,
        typ: 'temperatur_ueber',
        ausgeloestAm: new Date(),
      })
      .returning();
    const [ab] = await client.db
      .insert(abweichung)
      .values({ mandantId, bezugTyp: 'miete', bezugId: m!.id, beschreibung: `Test ${name}` })
      .returning();
    const [r] = await client.db
      .insert(rechnung)
      .values({
        mandantId,
        kundeId: k!.id,
        mieteId: m!.id,
        rechnungsnummer: `ZG-${randomUUID()}`,
        zeitraumVon: new Date(),
        zeitraumBis: new Date(),
        nettoCent: 100,
        steuerSatz: 19,
        steuerCent: 19,
        bruttoCent: 119,
      })
      .returning();
    return { kunde: k!.id, miete: m!.id, fahrzeug: fz, alarm: a!.id, abw: ab!.id, rechnung: r!.id };
  }

  beforeAll(async () => {
    client = createDbClient(url);
    zugriff = new Zugriff(client.db);
    kunden = new KundeService(client.db);
    const fahrzeuge = new FahrzeugService(client.db);
    mieten = new MieteService(
      client.db,
      fahrzeuge,
      kunden,
      new BerichtService(
        client.db,
        new KonfigProfilQuelle(),
        new HmacSignierer('test'),
        standardRenderer(),
        new InMemoryBerichtSpeicher(),
      ),
    );
    await client.db.insert(mandant).values([
      { id: mandantId, name: 'Test-Mandant Zugriff' },
      { id: fremderMandant, name: 'Fremder Mandant' },
    ]);
    d.a = await datenFuer('A', 'aktiv');
    d.b = await datenFuer('B', 'beendet');
    d.fremdFahrzeug = await fahrzeugAnlegen();
    // Miete eines anderen Mandanten (für die Mandantentrennung interner Rollen).
    const [fk] = await client.db
      .insert(kunde)
      .values({ mandantId: fremderMandant, firmenname: 'Fremd', status: 'freigegeben' })
      .returning();
    const [fm] = await client.db
      .insert(miete)
      .values({
        mandantId: fremderMandant,
        kundeId: fk!.id,
        fahrzeugId: await fahrzeugAnlegen(fremderMandant),
        startGeplant: new Date(),
        endeGeplant: new Date(Date.now() + STUNDE),
        status: 'bestaetigt',
      })
      .returning();
    d.fremdMandantMiete = fm!.id;
    await kunden.ordneKontoZu(admin, d.a.kunde, { kontoId: kontoA, bezeichnung: 'Dispo A' });
    await kunden.ordneKontoZu(admin, d.b.kunde, { kontoId: kontoB });
  });
  afterAll(async () => {
    await client.sql.end({ timeout: 5 });
  });

  it('Sicht: intern = Mandant, Kunde = eigener Kunde, ohne Zuordnung abgelehnt', async () => {
    expect(await zugriff.sicht(admin)).toEqual({ mandantId, kundeId: null });
    expect(await zugriff.sicht(kundeA)).toEqual({ mandantId, kundeId: d.a.kunde });
    await expect(
      zugriff.sicht({ akteurId: `konto-${randomUUID()}`, rollen: ['kunde_qa'], mandantId }),
    ).rejects.toThrow(ForbiddenException);
    // Zuordnung gilt nur im eigenen Mandanten.
    await expect(zugriff.sicht({ ...kundeA, mandantId: fremderMandant })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('Einzelabrufe: eigene ja, fremde „nicht gefunden“ – für jede Art', async () => {
    const pruefungen: [keyof Zugriff, 'kunde' | 'miete' | 'alarm' | 'abw' | 'rechnung'][] = [
      ['kunde', 'kunde'],
      ['miete', 'miete'],
      ['alarm', 'alarm'],
      ['abweichung', 'abw'],
      ['rechnung', 'rechnung'],
    ];
    for (const [art, feld] of pruefungen) {
      const pruefe = (p: Principal, id: string) =>
        (zugriff[art] as (p: Principal, id: string) => Promise<unknown>).call(zugriff, p, id);
      await expect(pruefe(kundeA, d.a[feld])).resolves.toBeDefined();
      await expect(pruefe(kundeA, d.b[feld])).rejects.toThrow(NotFoundException);
      await expect(pruefe(admin, d.b[feld])).resolves.toBeDefined();
      await expect(pruefe(admin, 'keine-uuid')).rejects.toThrow(NotFoundException);
    }
    // Interne Rollen: anderer Mandant ist ebenfalls „nicht gefunden“.
    await expect(zugriff.miete(admin, d.fremdMandantMiete)).rejects.toThrow(NotFoundException);
  });

  it('Fahrzeug: Kunden nur mit eigener Miete, Position nur während der laufenden', async () => {
    await expect(zugriff.fahrzeug(kundeA, d.a.fahrzeug)).resolves.toBeDefined();
    await expect(
      zugriff.fahrzeug(kundeA, d.a.fahrzeug, { nurLaufend: true }),
    ).resolves.toBeDefined();
    await expect(zugriff.fahrzeug(kundeA, d.fremdFahrzeug)).rejects.toThrow(NotFoundException);
    // B hatte seine Miete – Akte ja, Position nicht mehr.
    await expect(zugriff.fahrzeug(kundeB, d.b.fahrzeug)).resolves.toBeDefined();
    await expect(zugriff.fahrzeug(kundeB, d.b.fahrzeug, { nurLaufend: true })).rejects.toThrow(
      NotFoundException,
    );
    // Für die Buchung (Buchbarkeit) genügt der Mandant.
    await expect(
      zugriff.fahrzeug(kundeA, d.fremdFahrzeug, { nurMandant: true }),
    ).resolves.toBeDefined();
  });

  it('Controller: Listen nur mit eigenen Daten; Buchen und Status nur im eigenen Rahmen', async () => {
    const mc = new MieteController(mieten, zugriff);
    const liste = await mc.liste(kundeA, { limit: '50', offset: '0' });
    expect(liste.eintraege.map((m) => m.id)).toEqual([d.a.miete]);
    // Filter auf fremden Kunden wird ignoriert – die Sicht gewinnt.
    const umgehen = await mc.liste(kundeA, { kundeId: d.b.kunde, limit: '50', offset: '0' });
    expect(umgehen.eintraege.map((m) => m.id)).toEqual([d.a.miete]);
    await expect(mc.hole(kundeA, d.b.miete)).rejects.toThrow(NotFoundException);
    await expect(
      mc.erstelle(kundeA, {
        kundeId: d.b.kunde,
        fahrzeugId: d.fremdFahrzeug,
        startGeplant: new Date(Date.now() + 100 * STUNDE).toISOString(),
        endeGeplant: new Date(Date.now() + 120 * STUNDE).toISOString(),
      }),
    ).rejects.toThrow('Buchungen nur für den eigenen Kunden');
    await expect(mc.status(kundeA, d.a.miete, { status: 'beendet' })).rejects.toThrow(
      'Kunden können Buchungen nur stornieren',
    );

    const kc = new KundeController(kunden, zugriff);
    expect(
      (await kc.liste(kundeA, { limit: '50', offset: '0' })).eintraege.map((k) => k.id),
    ).toEqual([d.a.kunde]);
    await expect(kc.listeFahrer(kundeA, d.b.kunde)).rejects.toThrow(NotFoundException);

    const ac = new AlarmController(new AlarmService(client.db), zugriff);
    expect(
      (await ac.liste(kundeB, { limit: '50', offset: '0' })).eintraege.map((a) => a.id),
    ).toEqual([d.b.alarm]);
    const bc = new AbweichungController(new AbweichungService(client.db), zugriff);
    expect(
      (await bc.liste(kundeB, { limit: '50', offset: '0' })).eintraege.map((a) => a.id),
    ).toEqual([d.b.abw]);
    // Intern: alles im Mandanten.
    expect((await ac.liste(admin, { limit: '200', offset: '0' })).gesamt).toBeGreaterThanOrEqual(2);
  });

  it('Logins verwalten: eindeutig, Entfernen auditiert und sofort wirksam; „Wer bin ich?“', async () => {
    await expect(kunden.ordneKontoZu(admin, d.b.kunde, { kontoId: kontoA })).rejects.toThrow(
      ConflictException,
    );
    expect((await kunden.listeKonten(d.a.kunde)).map((k) => k.kontoId)).toEqual([kontoA]);

    const ich = new IchController(zugriff, client.db);
    expect(await ich.ich(kundeA)).toMatchObject({ kunde: { id: d.a.kunde }, hinweis: null });
    expect(await ich.ich(admin)).toMatchObject({ kunde: null, hinweis: null });

    const nur = `konto-c-${randomUUID()}`;
    await kunden.ordneKontoZu(admin, d.a.kunde, { kontoId: nur });
    await kunden.entferneKonto(admin, d.a.kunde, nur);
    const ohne: Principal = { akteurId: nur, rollen: ['kunde_qa'], mandantId };
    await expect(zugriff.sicht(ohne)).rejects.toThrow(ForbiddenException);
    expect(await ich.ich(ohne)).toMatchObject({
      kunde: null,
      hinweis: 'Ihr Zugang ist keinem Kunden zugeordnet',
    });
    const audit = await client.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.entitaetId, d.a.kunde), eq(auditEvent.entitaetTyp, 'kunde_konto')));
    expect(audit.map((a) => a.aktion).sort()).toEqual(['DELETE', 'POST', 'POST']);
  });
});
