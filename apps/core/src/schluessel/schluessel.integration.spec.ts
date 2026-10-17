/**
 * Integrationstest digitaler Schlüssel und Fernzugriff (D-014) gegen die echte
 * DB: Ausstellen (Regeln, Idempotenz), Befehle des Fahrers und durch Ops,
 * Protokoll inkl. abgelehnter Versuche, asynchrone Rückmeldung des Anbieters,
 * automatischer Widerruf bei Mietende, Mandantentrennung. Eigener Mandant je
 * Lauf. Nur mit RUN_INTEGRATION=1.
 */
import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FahrzeugBefehl, Principal } from '@rent2cool/shared';
import { BerichtService } from '../bericht/bericht.service';
import { KonfigProfilQuelle } from '../bericht/profil';
import { JsonNachweisRenderer, RendererRegistry } from '../bericht/renderer';
import { HmacSignierer } from '../bericht/signierer';
import { InMemoryBerichtSpeicher } from '../bericht/speicher';
import { createDbClient } from '../db/client';
import { auditEvent, fahrzeugBefehl, mandant, schluessel } from '../db/schema';
import { FahrzeugService } from '../fahrzeug/fahrzeug.service';
import { KundeService } from '../kunde/kunde.service';
import { MieteService } from '../miete/miete.service';
import { SimulatorKeyProvider, type KeyProvider } from './key-provider';
import { SchluesselService } from './schluessel.service';

const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ??
  'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool_test';
const STUNDE = 3600_000;

describe.skipIf(!RUN)('Digitaler Schlüssel und Fernzugriff (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;
  let fahrzeuge: FahrzeugService;
  let kunden: KundeService;
  let mieten: MieteService;
  let dienst: SchluesselService;
  const sim = new SimulatorKeyProvider();
  const mandantId = randomUUID();
  const ops: Principal = {
    akteurId: `test-schluessel-${randomUUID().slice(0, 8)}`,
    rollen: ['admin', 'ops'],
    mandantId,
  };
  const fahrerKonto = (konto: string): Principal => ({
    akteurId: konto,
    rollen: ['fahrer'],
    mandantId,
  });
  const key = () => `test-${randomUUID()}`;

  async function fahrzeug(): Promise<string> {
    const { id } = await fahrzeuge.erstelle(ops, {
      kennzeichen: `SK-${randomUUID().slice(0, 8)}`,
      zulGesamtmasseKg: 3500,
      benoetigteFuehrerscheinklasse: 'B',
      hatFahrtenschreiber: false,
      aggregat: { sensoren: [{ messgroesse: 'temperatur_laderaum', einheit: 'C' }] },
    });
    await fahrzeuge.aendereStatus(ops, id, 'verfuegbar');
    const akte = await fahrzeuge.holeAkte(id);
    await fahrzeuge.fuegeKalibrierungHinzu(ops, akte.aggregate[0]!.sensoren[0]!.id, {
      durchgefuehrtAm: new Date().toISOString(),
      gueltigBis: new Date(Date.now() + 365 * 24 * STUNDE).toISOString(),
    });
    return id;
  }

  async function kunde(): Promise<string> {
    const { id } = await kunden.erstelleKunde(ops, {
      firmenname: `SK ${randomUUID()}`,
      land: 'DE',
    });
    await kunden.aendereKundeStatus(ops, id, 'in_pruefung');
    await kunden.aendereKundeStatus(ops, id, 'freigegeben');
    return id;
  }

  /** Freigegebener Fahrer, optional mit App-Konto. */
  async function fahrer(kundeId: string, konto?: string, freigeben = true): Promise<string> {
    const { id } = await kunden.erstelleFahrer(ops, kundeId, {
      name: `Fahrer ${randomUUID().slice(0, 6)}`,
      fuehrerscheinKlasse: 'B',
      fuehrerscheinGueltigBis: new Date(Date.now() + 365 * 24 * STUNDE).toISOString(),
    });
    if (freigeben) {
      await kunden.aendereFahrerStatus(ops, id, 'identitaet_pruefung');
      await kunden.aendereFahrerStatus(ops, id, 'freigegeben');
    }
    if (konto) {
      const f = await kunden.holeFahrer(id);
      await kunden.aendereFahrer(ops, id, {
        version: f.aktualisiertAm.toISOString(),
        kontoId: konto,
      });
    }
    return id;
  }

  /** Miete ab `startInStunden`, optional gleich aktiv. */
  async function miete(kundeId: string, startInStunden = 0, aktiv = true) {
    const fz = await fahrzeug();
    const start = new Date(Date.now() + startInStunden * STUNDE);
    const { id } = await mieten.erstelle(ops, {
      kundeId,
      fahrzeugId: fz,
      startGeplant: start.toISOString(),
      endeGeplant: new Date(start.getTime() + 24 * STUNDE).toISOString(),
      auslandsfahrtGeplant: false,
    });
    if (aktiv) await mieten.aendereStatus(ops, id, 'aktiv');
    return { mieteId: id, fahrzeugId: fz };
  }

  async function audit(entitaetId: string, typ: string) {
    return client.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.entitaetId, entitaetId), eq(auditEvent.entitaetTyp, typ)));
  }

  async function grundeVon(p: Promise<unknown>): Promise<string[]> {
    const e = await p.then(
      () => undefined,
      (x: unknown) => x,
    );
    expect(e).toBeInstanceOf(ConflictException);
    return ((e as ConflictException).getResponse() as { gruende: string[] }).gruende;
  }

  beforeAll(async () => {
    client = createDbClient(url);
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
      sim,
    );
    dienst = new SchluesselService(client.db, sim, kunden, mieten);
    await client.db.insert(mandant).values({ id: mandantId, name: 'Test-Mandant Schlüssel' });
  });
  afterAll(async () => {
    await client.sql.end({ timeout: 5 });
  });

  it('Ausstellen: nur für Fahrer des Mietkunden mit Fahrerlaubnis; idempotent; auditiert', async () => {
    const k = await kunde();
    const { mieteId } = await miete(k);
    const fremd = await fahrer(await kunde());
    expect(await grundeVon(dienst.stelleAus(ops, mieteId, fremd))).toEqual([
      'Fahrer gehört nicht zum Kunden der Miete',
    ]);
    const ungeprueft = await fahrer(k, undefined, false);
    expect(await grundeVon(dienst.stelleAus(ops, mieteId, ungeprueft))).toEqual([
      expect.stringContaining('Fahrer: Status ist "angelegt"'),
    ]);

    const f = await fahrer(k);
    const erst = await dienst.stelleAus(ops, mieteId, f);
    expect(erst.idempotent).toBe(false);
    const nochmal = await dienst.stelleAus(ops, mieteId, f);
    expect(nochmal).toEqual({ id: erst.id, idempotent: true });

    const [s] = await client.db.select().from(schluessel).where(eq(schluessel.id, erst.id));
    expect(s).toMatchObject({ status: 'aktiv', gueltigBis: null, ausgestelltVon: ops.akteurId });
    expect(s!.anbieterRef).toMatch(/^sim-key-/);
    expect(await audit(erst.id, 'schluessel')).toHaveLength(1);

    const liste = await dienst.listeZurMiete(mandantId, mieteId);
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ id: erst.id, appKontoVerknuepft: false });

    // Anderer Mandant sieht die Miete nicht.
    await expect(dienst.stelleAus({ ...ops, mandantId: randomUUID() }, mieteId, f)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('Fahrer: ent- und verriegeln mit eigenem Schlüssel; Wiederholung liefert denselben Befehl', async () => {
    const k = await kunde();
    const { mieteId, fahrzeugId } = await miete(k);
    const konto = `konto-${randomUUID()}`;
    const f = await fahrer(k, konto);
    const { id } = await dienst.stelleAus(ops, mieteId, f);
    const ich = fahrerKonto(konto);

    expect(await dienst.meineSchluessel(ich)).toEqual([
      expect.objectContaining({ id, mieteId, fahrzeugId, mieteStatus: 'aktiv' }),
    ]);

    const k1 = key();
    const b = await dienst.befehlMitSchluessel(ich, id, {
      befehl: 'entriegeln',
      idempotencyKey: k1,
    });
    expect(b).toMatchObject({ status: 'ausgefuehrt', mieteId, schluesselId: id });
    expect(sim.zustand.get(fahrzeugId)?.verriegelt).toBe(false);
    const wieder = await dienst.befehlMitSchluessel(ich, id, {
      befehl: 'entriegeln',
      idempotencyKey: k1,
    });
    expect(wieder.id).toBe(b.id);
    const zeilen = await client.db
      .select()
      .from(fahrzeugBefehl)
      .where(eq(fahrzeugBefehl.idempotencyKey, k1));
    expect(zeilen).toHaveLength(1);

    // Anlage und Rückmeldung des Anbieters stehen im Audit Trail.
    expect(await audit(b.id, 'fahrzeug_befehl')).toHaveLength(1);
    const [status] = await audit(b.id, 'fahrzeug_befehl_status');
    expect(status).toMatchObject({
      akteurId: 'system:key-provider',
      quelle: 'key-provider:simulator',
      neuWert: { status: 'ausgefuehrt' },
    });

    await dienst.befehlMitSchluessel(ich, id, { befehl: 'verriegeln', idempotencyKey: key() });
    expect(sim.zustand.get(fahrzeugId)?.verriegelt).toBe(true);

    // Fremder Fahrer: Schlüssel „nicht gefunden“; Statusabfrage ebenso.
    const anderer = fahrerKonto(`konto-${randomUUID()}`);
    await expect(
      dienst.befehlMitSchluessel(anderer, id, { befehl: 'entriegeln', idempotencyKey: key() }),
    ).rejects.toThrow(NotFoundException);
    await expect(dienst.holeBefehl(anderer, b.id)).rejects.toThrow(NotFoundException);
    expect((await dienst.holeBefehl(ich, b.id)).id).toBe(b.id);
  });

  it('abgelehnte Versuche werden mit Gründen protokolliert', async () => {
    const k = await kunde();
    // Miete beginnt in 3 h: Schlüssel gilt erst ab 1 h vorher.
    const { mieteId } = await miete(k, 3, false);
    const konto = `konto-${randomUUID()}`;
    const { id } = await dienst.stelleAus(ops, mieteId, await fahrer(k, konto));
    const ich = fahrerKonto(konto);

    const k1 = key();
    const gruende = await grundeVon(
      dienst.befehlMitSchluessel(ich, id, { befehl: 'wegfahrsperre_aus', idempotencyKey: k1 }),
    );
    expect(gruende).toEqual([
      'Wegfahrsperre aus ist mit dem Fahrerschlüssel nicht erlaubt',
      expect.stringMatching(/^Schlüssel gilt erst ab /),
    ]);
    // Wiederholung bleibt abgelehnt, ohne neuen Eintrag.
    await grundeVon(
      dienst.befehlMitSchluessel(ich, id, { befehl: 'wegfahrsperre_aus', idempotencyKey: k1 }),
    );
    const zeilen = await client.db
      .select()
      .from(fahrzeugBefehl)
      .where(eq(fahrzeugBefehl.idempotencyKey, k1));
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({ status: 'abgelehnt', gruende });
    expect(zeilen[0]!.abgeschlossenAm).not.toBeNull();
    expect(await audit(zeilen[0]!.id, 'fahrzeug_befehl')).toHaveLength(1);
  });

  it('Ops: Befehl mit Grund, an die laufende Miete gehängt; Störung → fehlgeschlagen', async () => {
    const k = await kunde();
    const { mieteId, fahrzeugId } = await miete(k);
    const b = await dienst.befehlDurchBetrieb(ops, fahrzeugId, {
      befehl: 'wegfahrsperre_ein',
      grund: 'Test: Fahrzeug als gestohlen gemeldet',
      idempotencyKey: key(),
    });
    expect(b).toMatchObject({
      status: 'ausgefuehrt',
      mieteId,
      schluesselId: null,
      grund: 'Test: Fahrzeug als gestohlen gemeldet',
    });
    expect(sim.zustand.get(fahrzeugId)?.wegfahrsperre).toBe(true);

    sim.stoerung.add(fahrzeugId);
    const f = await dienst.befehlDurchBetrieb(ops, fahrzeugId, {
      befehl: 'entriegeln',
      grund: 'Test',
      idempotencyKey: key(),
    });
    expect(f).toMatchObject({
      status: 'fehlgeschlagen',
      gruende: ['Fahrzeug nicht erreichbar (Simulator)'],
    });
    sim.stoerung.delete(fahrzeugId);

    const seite = await dienst.liste(mandantId, { fahrzeugId }, { limit: 1, offset: 0 });
    expect(seite.gesamt).toBe(2);
    expect(seite.eintraege).toHaveLength(1);
    expect(seite.eintraege[0]!.id).toBe(f.id);
    expect((await dienst.liste(mandantId, { mieteId }, { limit: 10, offset: 0 })).gesamt).toBe(2);

    await expect(
      dienst.befehlDurchBetrieb({ ...ops, mandantId: randomUUID() }, fahrzeugId, {
        befehl: 'entriegeln',
        grund: 'Test',
        idempotencyKey: key(),
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('asynchroner Anbieter: gesendet, später bestätigt (nur einmal)', async () => {
    const offen: KeyProvider = {
      name: 'test-async',
      stelleAus: async () => ({ anbieterRef: 'k' }),
      widerrufe: async () => undefined,
      sendeBefehl: async (b: { befehlId: string; befehl: FahrzeugBefehl }) => ({
        anbieterRef: `async-${b.befehlId}`,
      }),
    };
    const asynchron = new SchluesselService(client.db, offen, kunden, mieten);
    const { fahrzeugId } = await miete(await kunde());
    const b = await asynchron.befehlDurchBetrieb(ops, fahrzeugId, {
      befehl: 'verriegeln',
      grund: 'Test',
      idempotencyKey: key(),
    });
    expect(b).toMatchObject({ status: 'gesendet', anbieterRef: `async-${b.id}` });

    const fertig = await asynchron.schliesseAb(b.id, { ok: true });
    expect(fertig.status).toBe('ausgefuehrt');
    const nochmal = await asynchron.schliesseAb(b.id, { ok: false, fehler: 'zu spät' });
    expect(nochmal.status).toBe('ausgefuehrt');
    expect(await audit(b.id, 'fahrzeug_befehl_status')).toHaveLength(1);
  });

  it('Mietende widerruft alle Schlüssel (auch beim Anbieter); danach keine Befehle mehr', async () => {
    const k = await kunde();
    const { mieteId } = await miete(k);
    const konto = `konto-${randomUUID()}`;
    const a = await dienst.stelleAus(ops, mieteId, await fahrer(k, konto));
    const b = await dienst.stelleAus(ops, mieteId, await fahrer(k));

    await mieten.aendereStatus(ops, mieteId, 'beendet');

    const zeilen = await client.db
      .select()
      .from(schluessel)
      .where(inArray(schluessel.id, [a.id, b.id]));
    expect(zeilen.map((z) => z.status)).toEqual(['widerrufen', 'widerrufen']);
    expect(zeilen.every((z) => z.widerrufGrund === 'Miete beendet')).toBe(true);
    for (const z of zeilen) expect(sim.gesperrt.has(z.anbieterRef!)).toBe(true);
    expect(await audit(a.id, 'schluessel_status')).toHaveLength(1);

    const gruende = await grundeVon(
      dienst.befehlMitSchluessel(fahrerKonto(konto), a.id, {
        befehl: 'entriegeln',
        idempotencyKey: key(),
      }),
    );
    expect(gruende).toEqual([
      'Schlüssel ist widerrufen',
      'Miete ist nicht bestätigt oder aktiv (Status beendet)',
    ]);
    expect(await dienst.meineSchluessel(fahrerKonto(konto))).toEqual([]);
    // Neuer Schlüssel für eine beendete Miete: abgelehnt.
    expect(await grundeVon(dienst.stelleAus(ops, mieteId, await fahrer(k)))).toEqual([
      'Miete ist nicht bestätigt oder aktiv (Status beendet)',
    ]);
  });

  it('Widerruf von Hand mit Grund; erneut = nichts zu tun; neuer Schlüssel danach möglich', async () => {
    const k = await kunde();
    const { mieteId } = await miete(k);
    const f = await fahrer(k);
    const { id } = await dienst.stelleAus(ops, mieteId, f);
    expect(await dienst.widerrufe(ops, id, { grund: 'Handy verloren' })).toMatchObject({
      geaendert: true,
    });
    expect(await dienst.widerrufe(ops, id, { grund: 'nochmal' })).toMatchObject({
      geaendert: false,
    });
    const [a] = await audit(id, 'schluessel_status');
    expect(a!.neuWert).toEqual({ status: 'widerrufen', widerrufGrund: 'Handy verloren' });
    const neu = await dienst.stelleAus(ops, mieteId, f);
    expect(neu.id).not.toBe(id);
  });

  it('Wegfahrsperre nur durch Administratoren (F-38); Türen auch durch Ops', async () => {
    const { fahrzeugId } = await miete(await kunde());
    const nurOps: Principal = { ...ops, rollen: ['ops'] };
    const gruende = await grundeVon(
      dienst.befehlDurchBetrieb(nurOps, fahrzeugId, {
        befehl: 'wegfahrsperre_ein',
        grund: 'Test',
        idempotencyKey: key(),
      }),
    );
    expect(gruende).toEqual(['Die Wegfahrsperre steuern nur Administratoren']);
    const tuer = await dienst.befehlDurchBetrieb(nurOps, fahrzeugId, {
      befehl: 'entriegeln',
      grund: 'Test',
      idempotencyKey: key(),
    });
    expect(tuer.status).toBe('ausgefuehrt');
    const protokoll = await dienst.liste(mandantId, { fahrzeugId }, { limit: 10, offset: 0 });
    expect(protokoll.eintraege.map((b) => b.status)).toEqual(['ausgefuehrt', 'abgelehnt']);
  });

  it('erstes Entriegeln startet die bestätigte Miete (F-39) – mit Übergabeprüfung und Audit', async () => {
    const k = await kunde();
    const { mieteId } = await miete(k, 0, false);
    const konto = `konto-${randomUUID()}`;
    const f = await fahrer(k, konto);
    const { id } = await dienst.stelleAus(ops, mieteId, f);
    const ich = fahrerKonto(konto);

    // Verriegeln startet nichts.
    await dienst.befehlMitSchluessel(ich, id, { befehl: 'verriegeln', idempotencyKey: key() });
    expect((await mieten.holeMiete(mieteId)).status).toBe('bestaetigt');

    await dienst.befehlMitSchluessel(ich, id, { befehl: 'entriegeln', idempotencyKey: key() });
    const m = await mieten.holeMiete(mieteId);
    expect(m.status).toBe('aktiv');
    expect(m.startIst).not.toBeNull();
    expect(m.uebergabePruefung).toMatchObject({ ergebnis: 'unbekannt' });
    const [eintrag] = await audit(mieteId, 'miete_status');
    expect(eintrag).toMatchObject({
      akteurId: konto,
      akteurRolle: 'fahrer',
      altWert: { status: 'bestaetigt' },
      neuWert: { status: 'aktiv' },
    });
    expect(eintrag!.akteurName).toMatch(/^Fahrer /);

    // Weiteres Entriegeln ändert nichts mehr.
    await dienst.befehlMitSchluessel(ich, id, { befehl: 'entriegeln', idempotencyKey: key() });
    expect(await audit(mieteId, 'miete_status')).toHaveLength(1);
  });

  it('asynchroner Anbieter: Miete startet erst mit der Bestätigung des Entriegelns', async () => {
    const offen: KeyProvider = {
      name: 'test-async',
      stelleAus: async () => ({ anbieterRef: `k-${randomUUID()}` }),
      widerrufe: async () => undefined,
      sendeBefehl: async (b: { befehlId: string }) => ({ anbieterRef: `async-${b.befehlId}` }),
    };
    const asynchron = new SchluesselService(client.db, offen, kunden, mieten);
    const k = await kunde();
    const { mieteId } = await miete(k, 0, false);
    const konto = `konto-${randomUUID()}`;
    const { id } = await asynchron.stelleAus(ops, mieteId, await fahrer(k, konto));
    const b = await asynchron.befehlMitSchluessel(fahrerKonto(konto), id, {
      befehl: 'entriegeln',
      idempotencyKey: key(),
    });
    expect(b.status).toBe('gesendet');
    expect((await mieten.holeMiete(mieteId)).status).toBe('bestaetigt');
    await asynchron.schliesseAb(b.id, { ok: true });
    expect((await mieten.holeMiete(mieteId)).status).toBe('aktiv');
  });

  it('No-Show: nicht begonnene Miete – Schlüssel endet mit dem geplanten Ende', async () => {
    const k = await kunde();
    // Geplant von vor 30 h bis vor 6 h, nie begonnen.
    const { mieteId } = await miete(k, -30, false);
    const konto = `konto-${randomUUID()}`;
    const { id } = await dienst.stelleAus(ops, mieteId, await fahrer(k, konto));
    const gruende = await grundeVon(
      dienst.befehlMitSchluessel(fahrerKonto(konto), id, {
        befehl: 'entriegeln',
        idempotencyKey: key(),
      }),
    );
    expect(gruende).toEqual([
      'Geplantes Mietende ist überschritten, ohne dass die Miete begonnen hat',
    ]);
    expect((await mieten.holeMiete(mieteId)).status).toBe('bestaetigt');
  });

  it('ein App-Konto gehört genau einem Fahrer', async () => {
    const k = await kunde();
    const konto = `konto-${randomUUID()}`;
    await fahrer(k, konto);
    await expect(fahrer(k, konto)).rejects.toThrow(
      'Dieses App-Konto ist bereits einem anderen Fahrer zugeordnet',
    );
  });
});
