/**
 * Integrationstest Übergabeprotokoll mit Foto-Check (D-014) gegen echte DB und
 * echten Objektspeicher (S3-API; lokal SeaweedFS, in der CI als Container):
 * Zugriff (Fahrer nur mit Schlüssel), Upload über signierten Link, Prüfung von
 * Größe/Typ/SHA-256, Abschluss nur vollständig, danach unveränderbar (auch in
 * der Datenbank). Eigener Mandant je Lauf. Nur mit RUN_INTEGRATION=1.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CHECKLISTE,
  PFLICHT_FOTOS,
  type FotoPerspektive,
  type Principal,
  type ProtokollArt,
} from '@rent2cool/shared';
import { BerichtService } from '../bericht/bericht.service';
import { KonfigProfilQuelle } from '../bericht/profil';
import { JsonNachweisRenderer, RendererRegistry } from '../bericht/renderer';
import { HmacSignierer } from '../bericht/signierer';
import { InMemoryBerichtSpeicher } from '../bericht/speicher';
import { createDbClient } from '../db/client';
import { auditEvent, mandant, uebergabeprotokoll } from '../db/schema';
import { FahrzeugService } from '../fahrzeug/fahrzeug.service';
import { KundeService } from '../kunde/kunde.service';
import { MieteService } from '../miete/miete.service';
import { testSpeicher } from '../objektspeicher/testspeicher';
import { SimulatorKeyProvider } from '../schluessel/key-provider';
import { SchluesselService } from '../schluessel/schluessel.service';
import { ProtokollService } from './protokoll.service';

const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ??
  'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool_test';
const STUNDE = 3600_000;

describe.skipIf(!RUN)('Übergabeprotokoll mit Foto-Check (Integration, braucht DB und S3)', () => {
  let client: ReturnType<typeof createDbClient>;
  let fahrzeuge: FahrzeugService;
  let kunden: KundeService;
  let mieten: MieteService;
  let schluessel: SchluesselService;
  let protokolle: ProtokollService;
  const mandantId = randomUUID();
  const ops: Principal = {
    akteurId: `test-protokoll-${randomUUID().slice(0, 8)}`,
    rollen: ['admin', 'ops'],
    mandantId,
  };
  const qa: Principal = { akteurId: 'test-qa', rollen: ['qa_approver'], mandantId };
  const key = () => `test-${randomUUID()}`;

  /** Miete (sofort beginnend) mit Fahrer, der einen Schlüssel und ein App-Konto hat. */
  async function mieteMitFahrer(aktiv = false) {
    const { id: fz } = await fahrzeuge.erstelle(ops, {
      kennzeichen: `PR-${randomUUID().slice(0, 8)}`,
      zulGesamtmasseKg: 3500,
      benoetigteFuehrerscheinklasse: 'B',
      hatFahrtenschreiber: false,
      aggregat: { sensoren: [{ messgroesse: 'temperatur_laderaum', einheit: 'C' }] },
    });
    await fahrzeuge.aendereStatus(ops, fz, 'verfuegbar');
    const akte = await fahrzeuge.holeAkte(fz);
    await fahrzeuge.fuegeKalibrierungHinzu(ops, akte.aggregate[0]!.sensoren[0]!.id, {
      durchgefuehrtAm: new Date().toISOString(),
      gueltigBis: new Date(Date.now() + 365 * 24 * STUNDE).toISOString(),
    });
    const { id: k } = await kunden.erstelleKunde(ops, {
      firmenname: `PR ${randomUUID()}`,
      land: 'DE',
    });
    await kunden.aendereKundeStatus(ops, k, 'in_pruefung');
    await kunden.aendereKundeStatus(ops, k, 'freigegeben');
    const { id: f } = await kunden.erstelleFahrer(ops, k, {
      name: 'Fahrer Protokoll',
      fuehrerscheinKlasse: 'B',
      fuehrerscheinGueltigBis: new Date(Date.now() + 365 * 24 * STUNDE).toISOString(),
    });
    await kunden.aendereFahrerStatus(ops, f, 'identitaet_pruefung');
    await kunden.aendereFahrerStatus(ops, f, 'freigegeben');
    const konto = `konto-${randomUUID()}`;
    const vorher = await kunden.holeFahrer(f);
    await kunden.aendereFahrer(ops, f, {
      version: vorher.aktualisiertAm.toISOString(),
      kontoId: konto,
    });
    const { id: mieteId } = await mieten.erstelle(ops, {
      kundeId: k,
      fahrzeugId: fz,
      fahrerId: f,
      startGeplant: new Date().toISOString(),
      endeGeplant: new Date(Date.now() + 24 * STUNDE).toISOString(),
      auslandsfahrtGeplant: false,
    });
    await schluessel.stelleAus(ops, mieteId, f);
    if (aktiv) await mieten.aendereStatus(ops, mieteId, 'aktiv');
    const fahrerLogin: Principal = { akteurId: konto, rollen: ['fahrer'], mandantId };
    return { mieteId, fahrerLogin };
  }

  /** Wie die App: anfordern, direkt in den Speicher hochladen, bestätigen. */
  async function foto(
    wer: Principal,
    protokollId: string,
    perspektive: FotoPerspektive,
    o: {
      daten?: Buffer;
      angegebenSha?: string;
      angegebenGroesse?: number;
      hochladen?: boolean;
    } = {},
  ) {
    const daten = o.daten ?? randomBytes(2048);
    const sha = createHash('sha256').update(daten).digest('hex');
    const r = await protokolle.fordereFotoAn(wer, protokollId, {
      perspektive,
      contentType: 'image/jpeg',
      groesse: o.angegebenGroesse ?? daten.length,
      sha256: o.angegebenSha ?? sha,
      idempotencyKey: key(),
    });
    if (o.hochladen !== false) {
      const put = await fetch(r.upload!.url, {
        method: 'PUT',
        body: daten,
        headers: r.upload!.kopfzeilen,
      });
      expect(put.status).toBe(200);
    }
    return { angefordert: r, daten };
  }

  async function vollstaendig(wer: Principal, protokollId: string, art: ProtokollArt) {
    for (const p of PFLICHT_FOTOS) {
      const { angefordert } = await foto(wer, protokollId, p);
      await protokolle.bestaetigeFoto(wer, protokollId, angefordert.foto.id);
    }
    const p = await protokolle.hole(wer, protokollId);
    await protokolle.aendere(wer, protokollId, {
      version: p.version,
      kmStand: 12_345,
      checkliste: Object.fromEntries(CHECKLISTE[art].map((c) => [c.id, { ok: true }])),
    });
  }

  beforeAll(async () => {
    client = createDbClient(url);
    fahrzeuge = new FahrzeugService(client.db);
    kunden = new KundeService(client.db);
    const sim = new SimulatorKeyProvider();
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
    schluessel = new SchluesselService(client.db, sim, kunden, mieten);
    protokolle = new ProtokollService(client.db, testSpeicher());
    await client.db.insert(mandant).values({ id: mandantId, name: 'Test-Mandant Protokoll' });
  });
  afterAll(async () => {
    await client.sql.end({ timeout: 5 });
  });

  it('Zugriff: Fahrer nur mit Schlüssel zur Miete; QA liest, schreibt nicht; idempotent', async () => {
    const { mieteId, fahrerLogin } = await mieteMitFahrer();
    const a = await protokolle.legeAn(fahrerLogin, mieteId, 'uebergabe');
    expect(a.idempotent).toBe(false);
    expect(await protokolle.legeAn(ops, mieteId, 'uebergabe')).toEqual({
      id: a.id,
      idempotent: true,
    });

    const fremd: Principal = { akteurId: `konto-${randomUUID()}`, rollen: ['fahrer'], mandantId };
    await expect(protokolle.hole(fremd, a.id)).rejects.toThrow(NotFoundException);
    expect((await protokolle.hole(qa, a.id)).art).toBe('uebergabe');
    await expect(protokolle.legeAn(qa, mieteId, 'rueckgabe')).rejects.toThrow(ForbiddenException);
    // Rückgabe erst, wenn die Miete läuft.
    await expect(protokolle.legeAn(fahrerLogin, mieteId, 'rueckgabe')).rejects.toThrow(
      ConflictException,
    );
    const [audit] = await client.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.entitaetId, a.id), eq(auditEvent.entitaetTyp, 'protokoll')));
    expect(audit).toMatchObject({ akteurId: fahrerLogin.akteurId });
  });

  it('Foto: signierter Upload direkt in den Speicher, Prüfung, Ansicht per Link', async () => {
    const { mieteId, fahrerLogin } = await mieteMitFahrer();
    const { id } = await protokolle.legeAn(fahrerLogin, mieteId, 'uebergabe');
    const { angefordert, daten } = await foto(fahrerLogin, id, 'vorne');
    expect(angefordert.foto.status).toBe('angefordert');
    expect(angefordert.upload!.kopfzeilen).toEqual({ 'content-type': 'image/jpeg' });

    const ok = await protokolle.bestaetigeFoto(fahrerLogin, id, angefordert.foto.id);
    expect(ok.status).toBe('hochgeladen');
    const geladen = Buffer.from(await (await fetch(ok.url!)).arrayBuffer());
    expect(geladen.equals(daten)).toBe(true);
    // Bestätigen ist wiederholbar.
    expect((await protokolle.bestaetigeFoto(fahrerLogin, id, angefordert.foto.id)).status).toBe(
      'hochgeladen',
    );
    const p = await protokolle.hole(qa, id);
    expect(p.fotos).toHaveLength(1);
    expect(p.fotos[0]).not.toHaveProperty('objektSchluessel');
    expect(p.fehlt).toContain('Foto fehlt: Heck');
  });

  it('Foto: falscher Typ beim Upload abgewiesen; fehlend, falsche Größe, falsche Prüfsumme verworfen', async () => {
    const { mieteId, fahrerLogin } = await mieteMitFahrer();
    const { id } = await protokolle.legeAn(ops, mieteId, 'uebergabe');

    // Der Typ ist Teil der Signatur: ein anderer Typ wird vom Speicher abgewiesen.
    const { angefordert: t } = await foto(fahrerLogin, id, 'vorne', { hochladen: false });
    const falscherTyp = await fetch(t.upload!.url, {
      method: 'PUT',
      body: randomBytes(10),
      headers: { 'content-type': 'text/html' },
    });
    expect(falscherTyp.status).toBe(403);
    // Nichts hochgeladen: noch nicht im Speicher, bleibt angefordert.
    const fehlend = await protokolle.bestaetigeFoto(fahrerLogin, id, t.foto.id).catch((e) => e);
    expect(fehlend).toBeInstanceOf(ConflictException);
    expect((fehlend as ConflictException).getResponse()).toMatchObject({
      fehler: 'Foto ist noch nicht im Speicher',
    });

    const { angefordert: g } = await foto(fahrerLogin, id, 'hinten', { angegebenGroesse: 999 });
    await expect(protokolle.bestaetigeFoto(fahrerLogin, id, g.foto.id)).rejects.toThrow(
      ConflictException,
    );
    const { angefordert: s } = await foto(fahrerLogin, id, 'links', {
      angegebenSha: 'a'.repeat(64),
    });
    let grund = '';
    await protokolle.bestaetigeFoto(fahrerLogin, id, s.foto.id).catch((e: ConflictException) => {
      grund = (e.getResponse() as { gruende: string[] }).gruende[0]!;
    });
    expect(grund).toContain('Prüfsumme');

    const p = await protokolle.hole(ops, id);
    expect(Object.fromEntries(p.fotos.map((f) => [f.perspektive, f.status]))).toEqual({
      vorne: 'angefordert',
      hinten: 'verworfen',
      links: 'verworfen',
    });
    expect(p.fotos.find((f) => f.perspektive === 'hinten')!.verwurfGrund).toContain('Größe');
  });

  it('Abschluss nur vollständig; danach unveränderbar – auch direkt in der Datenbank', async () => {
    const { mieteId, fahrerLogin } = await mieteMitFahrer(true);
    const { id } = await protokolle.legeAn(fahrerLogin, mieteId, 'rueckgabe');

    let fehlt: string[] = [];
    await protokolle.schliesseAb(fahrerLogin, id).catch((e: ConflictException) => {
      fehlt = (e.getResponse() as { gruende: string[] }).gruende;
    });
    expect(fehlt).toHaveLength(PFLICHT_FOTOS.length + CHECKLISTE.rueckgabe.length + 1);

    // Unbekannter Checklistenpunkt wird abgelehnt.
    const v0 = (await protokolle.hole(fahrerLogin, id)).version;
    await expect(
      protokolle.aendere(fahrerLogin, id, { version: v0, checkliste: { erfunden: { ok: true } } }),
    ).rejects.toThrow('Unbekannte Checklistenpunkte: erfunden');

    await vollstaendig(fahrerLogin, id, 'rueckgabe');
    // Checkliste wird ergänzt, nicht ersetzt: ein Punkt „nein“ mit Bemerkung, Schaden mit Foto.
    const { angefordert: sf } = await foto(fahrerLogin, id, 'schaden');
    await protokolle.bestaetigeFoto(fahrerLogin, id, sf.foto.id);
    const v1 = (await protokolle.hole(fahrerLogin, id)).version;
    await protokolle.aendere(fahrerLogin, id, {
      version: v1,
      checkliste: { keine_neuen_schaeden: { ok: false, bemerkung: 'Kratzer Heckklappe' } },
      schaeden: [{ beschreibung: 'Kratzer Heckklappe, ca. 10 cm', fotoIds: [sf.foto.id] }],
    });
    const vorAbschluss = await protokolle.hole(fahrerLogin, id);
    expect(Object.keys(vorAbschluss.checkliste!)).toHaveLength(CHECKLISTE.rueckgabe.length);
    expect(vorAbschluss.fehlt).toEqual([]);

    expect(await protokolle.schliesseAb(fahrerLogin, id)).toMatchObject({ geaendert: true });
    expect(await protokolle.schliesseAb(fahrerLogin, id)).toMatchObject({ geaendert: false });

    const nachher = await protokolle.hole(fahrerLogin, id);
    expect(nachher).toMatchObject({ status: 'abgeschlossen', kmStand: 12_345 });
    await expect(
      protokolle.aendere(fahrerLogin, id, { version: nachher.version, kmStand: 1 }),
    ).rejects.toThrow('abgeschlossen');
    await expect(foto(fahrerLogin, id, 'vorne', { hochladen: false })).rejects.toThrow(
      'abgeschlossen',
    );
    await expect(
      client.db.update(uebergabeprotokoll).set({ kmStand: 1 }).where(eq(uebergabeprotokoll.id, id)),
    ).rejects.toThrow();
    const [status] = await client.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.entitaetId, id), eq(auditEvent.entitaetTyp, 'protokoll_status')));
    expect(status!.neuWert).toEqual({ status: 'abgeschlossen' });
  });
});
