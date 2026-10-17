/**
 * Integrationstest Demo-Daten gegen die echte DB: Laden in einen eigenen
 * Mandanten, fachliche Stimmigkeit (Nachweise, Alarme, Rechnungen, Status),
 * Audit-Akteur und einmaliges Laden. Nur mit RUN_INTEGRATION=1.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { AbweichungService } from '../../alarm/abweichung.service';
import { AlarmService } from '../../alarm/alarm.service';
import { BerichtService } from '../../bericht/bericht.service';
import { KonfigProfilQuelle } from '../../bericht/profil';
import { standardRenderer } from '../../bericht/renderer';
import { HmacSignierer } from '../../bericht/signierer';
import { InMemoryBerichtSpeicher } from '../../bericht/speicher';
import { FahrzeugService } from '../../fahrzeug/fahrzeug.service';
import { KundeService } from '../../kunde/kunde.service';
import type { Env } from '../../config/env';
import { MieteService } from '../../miete/miete.service';
import { RechnungService } from '../../rechnung/rechnung.service';
import { createDbClient } from '../client';
import {
  abweichung,
  alarm,
  auditEvent,
  fahrzeug,
  fahrzeugBefehl,
  miete,
  protokollFoto,
  rechnung,
  schluessel,
  temperaturnachweisArchiv,
  uebergabeprotokoll,
} from '../schema';
import { testSpeicher } from '../../objektspeicher/testspeicher';
import { DEMO_AKTEUR_ID } from './demo-daten';
import { ladeDemoDaten, type DemoErgebnis } from './demo';

const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ??
  'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool_test';

describe.skipIf(!RUN)('Demo-Daten (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;
  let mieten: MieteService;
  let fahrzeuge: FahrzeugService;
  let kunden: KundeService;
  let ergebnis: DemoErgebnis;
  const mandantId = randomUUID();

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
        standardRenderer(),
        new InMemoryBerichtSpeicher(),
      ),
    );
    ergebnis = await ladeDemoDaten(client.db, { mandantId, speicher: testSpeicher() });
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
      standorte: 2,
      schluessel: 2,
      befehle: 3,
      protokolle: 2,
      fotos: 13,
      nachweise: 3,
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

  it('Listen liefern Kennzeichen und Firmennamen gleich mit (ohne Einzelabfragen)', async () => {
    const seite = { limit: 50, offset: 0 };
    const m = await mieten.liste(mandantId, seite);
    expect(m.eintraege.every((x) => x.fahrzeugKennzeichen.startsWith('DEMO-'))).toBe(true);
    expect(m.eintraege.every((x) => x.kundeFirmenname.endsWith('(Demo)'))).toBe(true);

    const a = await new AlarmService(client.db).liste(mandantId, seite);
    expect(new Set(a.eintraege.map((x) => x.fahrzeugKennzeichen))).toEqual(
      new Set(['DEMO-102', 'DEMO-104']),
    );

    const config = { get: () => 19 } as unknown as ConfigService<Env, true>;
    const r = await new RechnungService(client.db, config, mieten).liste(mandantId, seite);
    expect(r.eintraege.every((x) => x.kundeFirmenname.endsWith('(Demo)'))).toBe(true);

    // Abweichung mit Bezug „miete“: Kennzeichen über die Miete aufgelöst.
    const abw = new AbweichungService(client.db);
    const [eintrag] = (await abw.liste(mandantId, seite)).eintraege;
    expect(eintrag).toMatchObject({ bezugTyp: 'miete', bezugKennzeichen: 'DEMO-102' });
    expect((await abw.hole(eintrag!.id)).bezugKennzeichen).toBe('DEMO-102');
  });

  it('Fristen: nur Fälliges, von der Datenbank gefiltert', async () => {
    const in30Tagen = new Date(Date.now() + 30 * 86_400_000);
    const kal = await fahrzeuge.faelligeKalibrierungen(mandantId, in30Tagen);
    expect(kal.map((k) => [k.kennzeichen, k.seriennummer])).toEqual([['DEMO-103', 'DEMO-TS-1003']]);
    const fs = await kunden.faelligeFuehrerscheine(mandantId, in30Tagen);
    expect(fs.map((f) => f.name)).toEqual(['Max Mustermann']);
  });

  it('Fahrzeugsuche: nur buchbare im Zeitraum – und jeder Treffer besteht die Buchungsprüfung', async () => {
    const [m5] = await client.db
      .select({ start: miete.startGeplant, ende: miete.endeGeplant, kundeId: miete.kundeId })
      .from(miete)
      .innerJoin(fahrzeug, eq(miete.fahrzeugId, fahrzeug.id))
      .where(
        and(
          eq(miete.mandantId, mandantId),
          eq(fahrzeug.kennzeichen, 'DEMO-101'),
          eq(miete.status, 'bestaetigt'),
        ),
      );
    const kennz = async (
      o: Partial<Parameters<FahrzeugService['sucheVerfuegbare']>[1]> & { von: Date; bis: Date },
    ) =>
      (await fahrzeuge.sucheVerfuegbare(mandantId, { limit: 20, offset: 0, ...o })).eintraege.map(
        (f) => f.kennzeichen,
      );
    const TAG = 86_400_000;

    // Während der Buchung von DEMO-101: belegt; DEMO-104 vermietet, DEMO-105 in Wartung.
    const imZeitraum = { von: m5!.start, bis: new Date(m5!.start.getTime() + TAG) };
    expect(await kennz(imZeitraum)).toEqual(['DEMO-102', 'DEMO-103']);
    // Direkt nach Rückgabe wieder frei (halboffene Zeiträume).
    expect(await kennz({ von: m5!.ende, bis: new Date(m5!.ende.getTime() + TAG) })).toContain(
      'DEMO-101',
    );
    // In drei Wochen: Kalibrierung von DEMO-103 abgelaufen.
    const spaeter = { von: new Date(Date.now() + 21 * TAG), bis: new Date(Date.now() + 22 * TAG) };
    expect(await kennz(spaeter)).toEqual(['DEMO-101', 'DEMO-102']);
    // Ausland → nur mit Fahrtenschreiber; Kennzeichen-Suche; Führerscheinklasse.
    expect(await kennz({ ...spaeter, fahrtenschreiber: true })).toEqual(['DEMO-102']);
    expect(await kennz({ ...spaeter, suche: '101' })).toEqual(['DEMO-101']);
    expect(await kennz({ ...spaeter, suche: '%' })).toEqual([]);
    expect(await kennz({ ...spaeter, klassen: ['C1'] })).toEqual([]);
    expect(await kennz({ ...spaeter, klassen: ['B', 'C1'] })).toEqual(['DEMO-101', 'DEMO-102']);
    // Blättern mit Gesamtzahl.
    const seite = await fahrzeuge.sucheVerfuegbare(mandantId, { ...spaeter, limit: 1, offset: 1 });
    expect(seite).toMatchObject({ gesamt: 2, eintraege: [{ kennzeichen: 'DEMO-102' }] });

    // Suche und Buchung sind sich einig.
    for (const fenster of [imZeitraum, spaeter]) {
      const treffer = await fahrzeuge.sucheVerfuegbare(mandantId, {
        ...fenster,
        limit: 20,
        offset: 0,
      });
      for (const f of treffer.eintraege) {
        const gruende = await mieten.pruefeBuchung(mandantId, {
          kundeId: m5!.kundeId,
          fahrzeugId: f.id,
          auslandsfahrtGeplant: false,
          startGeplant: fenster.von,
          endeGeplant: fenster.bis,
        });
        expect(gruende).toEqual([]);
      }
    }
  });

  it('Kundensuche nach Teil des Firmennamens', async () => {
    const r = await kunden.listeKunden(mandantId, { suche: 'nordLICHT', limit: 10, offset: 0 });
    expect(r.eintraege.map((k) => k.firmenname)).toEqual(['Nordlicht Arzneimittel GmbH (Demo)']);
    expect((await kunden.listeKunden(mandantId, { suche: '_', limit: 10, offset: 0 })).gesamt).toBe(
      0,
    );
  });

  it('Übergabebereich: Prüfungen der Mieten und aktuelle Positionen', async () => {
    const alle = await client.db.select().from(miete).where(eq(miete.mandantId, mandantId));
    const abgeschlossen = alle.filter((m) => m.rueckgabePruefung);
    expect(abgeschlossen.map((m) => m.rueckgabePruefung!.ergebnis).sort()).toEqual([
      'ausserhalb',
      'im_bereich',
      'im_bereich',
    ]);
    expect(
      alle
        .filter((m) => m.status !== 'bestaetigt')
        .every((m) => m.uebergabePruefung?.ergebnis === 'im_bereich'),
    ).toBe(true);
    const fz = await client.db.select().from(fahrzeug).where(eq(fahrzeug.mandantId, mandantId));
    const unterwegs = fz.find((f) => f.kennzeichen === 'DEMO-104')!;
    const zuHause = fz.find((f) => f.kennzeichen === 'DEMO-101')!;
    const p1 = await fahrzeuge.positionUndBereich(mandantId, unterwegs.id);
    expect(p1.pruefung.ergebnis).toBe('ausserhalb');
    expect(p1.pruefung.abstandM).toBeGreaterThan(17_000);
    expect((await fahrzeuge.positionUndBereich(mandantId, zuHause.id)).pruefung.ergebnis).toBe(
      'im_bereich',
    );
  });

  it('digitaler Schlüssel: laufende Miete mit Befehlen des Fahrers, künftige noch nicht gültig', async () => {
    const alle = await client.db.select().from(miete).where(eq(miete.mandantId, mandantId));
    const aktiv = alle.find((m) => m.status === 'aktiv')!;
    const schl = await client.db
      .select()
      .from(schluessel)
      .where(eq(schluessel.mandantId, mandantId));
    expect(schl).toHaveLength(2);
    expect(schl.every((s) => s.status === 'aktiv')).toBe(true);
    const befehle = await client.db
      .select()
      .from(fahrzeugBefehl)
      .where(eq(fahrzeugBefehl.mieteId, aktiv.id))
      .orderBy(fahrzeugBefehl.angefordertAm);
    expect(befehle.map((b) => [b.befehl, b.status])).toEqual([
      ['entriegeln', 'ausgefuehrt'],
      ['verriegeln', 'ausgefuehrt'],
      ['wegfahrsperre_aus', 'abgelehnt'],
    ]);
    const kuenftig = schl.find((s) => s.mieteId !== aktiv.id)!;
    expect(kuenftig.gueltigVon.getTime()).toBeGreaterThan(Date.now());
  });

  it('Protokolle: abgeschlossen, Fotos geprüft, Schaden mit Detailfoto', async () => {
    const zeilen = await client.db
      .select()
      .from(uebergabeprotokoll)
      .where(eq(uebergabeprotokoll.mandantId, mandantId));
    expect(zeilen.map((p) => [p.art, p.status]).sort()).toEqual([
      ['rueckgabe', 'abgeschlossen'],
      ['uebergabe', 'abgeschlossen'],
    ]);
    const rueckgabe = zeilen.find((p) => p.art === 'rueckgabe')!;
    expect(rueckgabe.schaeden).toEqual([
      { beschreibung: expect.stringContaining('Kratzer'), fotoIds: [expect.any(String)] },
    ]);
    expect(rueckgabe.checkliste!.keine_neuen_schaeden).toMatchObject({ ok: false });
    const fotos = await client.db
      .select()
      .from(protokollFoto)
      .where(eq(protokollFoto.mandantId, mandantId));
    expect(fotos).toHaveLength(13);
    expect(fotos.every((f) => f.status === 'hochgeladen')).toBe(true);
    // Die Übergabe hat der Fahrer mit seinem App-Konto protokolliert.
    expect(zeilen.find((p) => p.art === 'uebergabe')!.erstelltVon).toMatch(/^demo-konto-max-/);
  });

  it('Temperaturnachweise der beendeten Mieten liegen im Archiv', async () => {
    const archiv = await client.db
      .select()
      .from(temperaturnachweisArchiv)
      .where(eq(temperaturnachweisArchiv.mandantId, mandantId));
    // Die Miete mit Ausreißer (Demo) ist im Archiv als verletzt bewertet.
    expect(archiv.map((a) => a.bewertung).sort()).toEqual([
      'eingehalten',
      'eingehalten',
      'verletzt',
    ]);
    expect(archiv.every((a) => a.ausloeser === 'automatisch' && a.version === 1)).toBe(true);
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
