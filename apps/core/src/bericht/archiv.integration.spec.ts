/**
 * Integrationstest Temperaturnachweis-Archiv gegen echte DB, echten
 * Objektspeicher und echtes Valkey: automatischer Nachweis nach Mietende
 * (idempotent), Versionen, Dateien JSON/PDF mit Prüfsummen, Echtheitsprüfung
 * (Manipulation, Nachlieferung), Unveränderbarkeit, Berichtsdienst (BullMQ).
 * Eigener Mandant je Lauf. Nur mit RUN_INTEGRATION=1.
 */
import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal, TelemetrieNachricht } from '@rent2cool/shared';
import type { Env } from '../config/env';
import { createDbClient } from '../db/client';
import { auditEvent, mandant, miete, temperaturnachweisArchiv } from '../db/schema';
import { FahrzeugService } from '../fahrzeug/fahrzeug.service';
import { KundeService } from '../kunde/kunde.service';
import { testSpeicher } from '../objektspeicher/testspeicher';
import { verarbeiteNachricht } from '../telemetry/processor';
import { NachweisArchiv } from './archiv.service';
import { BerichtService } from './bericht.service';
import { Berichtsdienst } from './berichtsdienst';
import { KonfigProfilQuelle } from './profil';
import { standardRenderer } from './renderer';
import { HmacSignierer } from './signierer';
import { InMemoryBerichtSpeicher } from './speicher';

const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ??
  'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool_test';
const VALKEY = process.env.VALKEY_URL ?? 'redis://localhost:6379';
const MIN = 60_000;

describe.skipIf(!RUN)('Temperaturnachweis-Archiv (Integration, braucht DB, S3, Valkey)', () => {
  let client: ReturnType<typeof createDbClient>;
  let fahrzeuge: FahrzeugService;
  let kunden: KundeService;
  let archiv: NachweisArchiv;
  const speicher = testSpeicher();
  const mandantId = randomUUID();
  const ops: Principal = {
    akteurId: `test-archiv-${randomUUID().slice(0, 8)}`,
    rollen: ['admin', 'ops', 'qa_approver'],
    mandantId,
  };

  async function sende(fahrzeugId: string, zeit: Date, wert: number) {
    const n: TelemetrieNachricht = {
      nachrichtId: `test-arch-${randomUUID()}`,
      fahrzeugId,
      quelle: 'test',
      gesendetAm: zeit.toISOString(),
      messwerte: [{ messgroesse: 'temperatur_laderaum', wert, einheit: 'C' }],
    };
    await verarbeiteNachricht(client.db, n);
  }

  /** Beendete Miete (vor 2 h bis vor 1 h) mit Messwerten je Minute, eine Spitze. */
  async function beendeteMiete() {
    const { id: fz } = await fahrzeuge.erstelle(ops, {
      kennzeichen: `NA-${randomUUID().slice(0, 8)}`,
      zulGesamtmasseKg: 3500,
      benoetigteFuehrerscheinklasse: 'B',
      hatFahrtenschreiber: false,
      aggregat: { sensoren: [{ messgroesse: 'temperatur_laderaum', einheit: 'C' }] },
    });
    const { id: k } = await kunden.erstelleKunde(ops, {
      firmenname: `NA ${randomUUID()}`,
      land: 'DE',
    });
    const start = new Date(Date.now() - 120 * MIN);
    const ende = new Date(Date.now() - 60 * MIN);
    const [m] = await client.db
      .insert(miete)
      .values({
        mandantId,
        kundeId: k,
        fahrzeugId: fz,
        startGeplant: start,
        endeGeplant: ende,
        startIst: start,
        endeIst: ende,
        temperaturprofil: '2-8',
        status: 'beendet',
      })
      .returning();
    for (let i = 0; i <= 60; i += 1) {
      await sende(fz, new Date(start.getTime() + i * MIN), i === 30 ? 8.6 : 5 + (i % 3) * 0.2);
    }
    return { mieteId: m!.id, fahrzeugId: fz, start };
  }

  beforeAll(async () => {
    client = createDbClient(url);
    fahrzeuge = new FahrzeugService(client.db);
    kunden = new KundeService(client.db);
    const berichte = new BerichtService(
      client.db,
      new KonfigProfilQuelle(),
      new HmacSignierer('test'),
      standardRenderer(),
      new InMemoryBerichtSpeicher(),
    );
    archiv = new NachweisArchiv(client.db, berichte, speicher);
    await client.db.insert(mandant).values({ id: mandantId, name: 'Test-Mandant Archiv' });
  });
  afterAll(async () => {
    await client.sql.end({ timeout: 5 });
  });

  it('fällig erst nach der Karenzzeit; automatisch genau einmal; Dateien JSON und PDF', async () => {
    const { mieteId } = await beendeteMiete();
    expect(await archiv.faellige(new Date(), 30, 10_000)).toContain(mieteId);
    expect(await archiv.faellige(new Date(), 90, 10_000)).not.toContain(mieteId);

    const a = await archiv.erstelle(mieteId, {
      ausloeser: 'automatisch',
      akteur: { akteurId: 'system:berichtsdienst', rollen: [] },
    });
    expect(a).toMatchObject({ version: 1, idempotent: false });
    expect(
      await archiv.erstelle(mieteId, {
        ausloeser: 'automatisch',
        akteur: { akteurId: 'system:berichtsdienst', rollen: [] },
      }),
    ).toEqual({ ...a, idempotent: true });
    expect(await archiv.faellige(new Date(), 30, 10_000)).not.toContain(mieteId);

    const [eintrag] = await archiv.liste(ops, mieteId);
    expect(eintrag).toMatchObject({
      version: 1,
      bewertung: 'verletzt',
      anzahlGrenzverletzungen: 1,
    });
    expect(eintrag).not.toHaveProperty('jsonSchluessel');
    const json = Buffer.from(await (await fetch(eintrag!.jsonUrl)).arrayBuffer());
    const pdf = Buffer.from(await (await fetch(eintrag!.pdfUrl)).arrayBuffer());
    expect(createHash('sha256').update(json).digest('hex')).toBe(eintrag!.jsonSha256);
    expect(createHash('sha256').update(pdf).digest('hex')).toBe(eintrag!.pdfSha256);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const dok = JSON.parse(json.toString('utf8'));
    expect(dok).toMatchObject({ version: 1, ausloeser: 'automatisch', miete: { mieteId } });
    expect(dok.nachweis.kennzahlen.anzahl).toBe(61);
    expect(Math.max(...dok.kurve.map((p: { wert: number }) => p.wert))).toBe(8.6);

    const [audit] = await client.db
      .select()
      .from(auditEvent)
      .where(
        and(eq(auditEvent.entitaetId, a.id), eq(auditEvent.entitaetTyp, 'temperaturnachweis')),
      );
    expect(audit).toMatchObject({ akteurId: 'system:berichtsdienst', mandantId });
  });

  it('Echtheitsprüfung: echt; Nachlieferung erkannt; manipulierte Datei erkannt', async () => {
    const { mieteId, fahrzeugId, start } = await beendeteMiete();
    const { id } = await archiv.erstelle(mieteId, { ausloeser: 'manuell', akteur: ops });
    expect(await archiv.pruefe(ops, id)).toMatchObject({
      ergebnis: 'echt',
      dateienUnveraendert: true,
      signaturenGueltig: true,
      messdatenUnveraendert: true,
      hinweise: [],
    });

    // Funkloch-Nachlieferung im Mietzeitraum: Dateien bleiben echt, Messdaten nicht mehr aktuell.
    await sende(fahrzeugId, new Date(start.getTime() + 30.5 * MIN), 5.1);
    const nach = await archiv.pruefe(ops, id);
    expect(nach).toMatchObject({ ergebnis: 'echt', messdatenUnveraendert: false });
    expect(nach.hinweise[0]).toContain('Nachlieferung');
    // Neue Version erfasst die Nachlieferung.
    const v2 = await archiv.erstelle(mieteId, { ausloeser: 'manuell', akteur: ops });
    expect(v2.version).toBe(2);
    expect((await archiv.pruefe(ops, v2.id)).messdatenUnveraendert).toBe(true);
    expect((await archiv.liste(ops, mieteId)).map((x) => x.version)).toEqual([2, 1]);

    // Datei im Speicher ausgetauscht → Abweichung.
    const [zeile] = await client.db
      .select()
      .from(temperaturnachweisArchiv)
      .where(eq(temperaturnachweisArchiv.id, id));
    await speicher.ablegen(zeile!.pdfSchluessel, 'application/pdf', Buffer.from('%PDF-gefaelscht'));
    const falsch = await archiv.pruefe(ops, id);
    expect(falsch).toMatchObject({ ergebnis: 'abweichung', dateienUnveraendert: false });
    expect(falsch.hinweise).toContain('PDF-Datei fehlt oder wurde verändert');
  });

  it('Archiv ist unveränderbar; nur nach Mietende; Mandantentrennung', async () => {
    const { mieteId } = await beendeteMiete();
    const { id } = await archiv.erstelle(mieteId, { ausloeser: 'manuell', akteur: ops });
    await expect(
      client.db
        .update(temperaturnachweisArchiv)
        .set({ bewertung: 'eingehalten' })
        .where(eq(temperaturnachweisArchiv.id, id)),
    ).rejects.toThrow();
    await expect(
      client.db.delete(temperaturnachweisArchiv).where(eq(temperaturnachweisArchiv.id, id)),
    ).rejects.toThrow();

    await client.db
      .update(miete)
      .set({ status: 'aktiv', endeIst: null })
      .where(eq(miete.id, mieteId));
    await expect(archiv.erstelle(mieteId, { ausloeser: 'manuell', akteur: ops })).rejects.toThrow(
      ConflictException,
    );
    const fremd = { ...ops, mandantId: randomUUID() };
    await expect(archiv.liste(fremd, mieteId)).rejects.toThrow(NotFoundException);
    await expect(archiv.pruefe(fremd, id)).rejects.toThrow(NotFoundException);
  });

  it('Berichtsdienst: Suchlauf über BullMQ reiht ein, Job erzeugt den Nachweis', async () => {
    const { mieteId } = await beendeteMiete();
    const config = {
      get: (k: keyof Env) =>
        ({ BERICHT_WORKER_ENABLED: true, BERICHT_KARENZ_MIN: 30, BERICHT_SUCHE_SEK: 3600 })[
          k as string
        ],
    } as unknown as ConfigService<Env, true>;
    // Suchlauf auf diese Miete begrenzt (die Test-DB enthält Mieten anderer Läufe).
    const begrenzt = Object.assign(Object.create(archiv) as NachweisArchiv, {
      faellige: async () => [mieteId],
    });
    const dienst = new Berichtsdienst(config, begrenzt);
    await dienst.starte(VALKEY, 3600, `berichte-test-${randomUUID()}`);
    try {
      let zeilen: { version: number }[] = [];
      for (let i = 0; i < 60 && zeilen.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 250));
        zeilen = await client.db
          .select({ version: temperaturnachweisArchiv.version })
          .from(temperaturnachweisArchiv)
          .where(eq(temperaturnachweisArchiv.mieteId, mieteId));
      }
      expect(zeilen).toEqual([{ version: 1 }]);
      // Manuell über die Warteschlange: neue Version.
      const { jobId } = await dienst.fordereAn(mieteId, ops);
      expect(jobId).toMatch(/^nachweis-manuell-/);
      for (let i = 0; i < 60 && zeilen.length < 2; i++) {
        await new Promise((r) => setTimeout(r, 250));
        zeilen = await client.db
          .select({ version: temperaturnachweisArchiv.version })
          .from(temperaturnachweisArchiv)
          .where(eq(temperaturnachweisArchiv.mieteId, mieteId));
      }
      expect(zeilen.map((z) => z.version).sort()).toEqual([1, 2]);
    } finally {
      await dienst.onModuleDestroy();
    }
  });
});
