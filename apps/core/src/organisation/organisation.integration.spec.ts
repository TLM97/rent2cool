/**
 * Integrationstest Selbstregistrierung und Organisation (F-51) gegen die echte
 * DB: Kunde registriert sich, ist „in Prüfung“, bucht erst nach Freigabe;
 * Verwalter lädt ein (Code nur per Mail, nur Hash gespeichert), nur die
 * eingeladene E-Mail löst ein; Rollen ändern, entfernen, mindestens ein
 * Verwalter bleibt. Nur mit RUN_INTEGRATION=1.
 */
import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@rent2cool/shared';
import { mitKundenkonto } from '../auth/konto';
import type { Env } from '../config/env';
import { createDbClient } from '../db/client';
import { auditEvent, kunde, kundeEinladung, kundeKonto, mandant } from '../db/schema';
import type { BerichtService } from '../bericht/bericht.service';
import { FahrzeugService } from '../fahrzeug/fahrzeug.service';
import { KundeService } from '../kunde/kunde.service';
import { MieteService } from '../miete/miete.service';
import { SpeicherMailVersand } from '../mail/mail-versand';
import { OrganisationService } from './organisation.service';

const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ??
  'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool_test';

describe.skipIf(!RUN)('Selbstregistrierung und Organisation (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;
  let org: OrganisationService;
  let kunden: KundeService;
  const mail = new SpeicherMailVersand();
  const mandantId = randomUUID();
  const config = {
    get: (k: string) =>
      ({ PORTAL_URL: 'http://portal.test', BETRIEB_EMAIL: 'betrieb@rent2cool.example' })[k],
  } as unknown as ConfigService<Env, true>;

  /** Neuer Login (wie frisch registriert: keine Rollen), mit Kundenzuordnung angereichert. */
  const login = async (email: string, rollen: Principal['rollen'] = []): Promise<Principal> =>
    mitKundenkonto(client.db, {
      akteurId: `konto-${randomUUID()}`,
      name: email.split('@')[0],
      email,
      rollen,
      mandantId,
    });
  const erneut = (p: Principal) =>
    mitKundenkonto(client.db, { ...p, rollen: [], kundeId: undefined });
  const codeAus = (text: string) => /code=([A-Za-z0-9_-]+)/.exec(text)![1]!;

  beforeAll(async () => {
    client = createDbClient(url);
    kunden = new KundeService(client.db);
    org = new OrganisationService(client.db, kunden, mail, config);
    await client.db.insert(mandant).values({ id: mandantId, name: 'Test-Mandant Organisation' });
  });
  afterAll(async () => {
    await client.sql.end({ timeout: 5 });
  });

  it('Registrierung: eigener Kunde „in Prüfung“, Login wird Verwalter, Betrieb erfährt es', async () => {
    const anna = await login(`anna-${randomUUID().slice(0, 6)}@kunde.example`);
    const { kundeId } = await org.registriere(anna, {
      firmenname: 'Selbstpharma GmbH',
      land: 'DE',
    });
    const [k] = await client.db.select().from(kunde).where(eq(kunde.id, kundeId));
    expect(k).toMatchObject({ status: 'in_pruefung', firmenname: 'Selbstpharma GmbH' });

    const angemeldet = await erneut(anna);
    expect(angemeldet.kundeId).toBe(kundeId);
    expect([...angemeldet.rollen].sort()).toEqual(['kunde_admin', 'kunde_dispo', 'kunde_qa']);
    expect(mail.gesendet.at(-1)).toMatchObject({
      an: 'betrieb@rent2cool.example',
      betreff: 'Neue Registrierung zur Freigabe: Selbstpharma GmbH',
    });

    // Gebucht wird erst nach unserer Freigabe (bestehende Regel, D-010).
    const mieten = new MieteService(
      client.db,
      new FahrzeugService(client.db),
      kunden,
      {} as BerichtService,
    );
    const gruende = await mieten.pruefeBuchung(mandantId, {
      kundeId,
      fahrzeugId: randomUUID(),
      auslandsfahrtGeplant: false,
      startGeplant: new Date(),
      endeGeplant: new Date(Date.now() + 3600_000),
    });
    expect(gruende).toContain('Kunde ist nicht freigegeben (Status in_pruefung)');

    await expect(
      org.registriere(angemeldet, { firmenname: 'Zweite GmbH', land: 'DE' }),
    ).rejects.toThrow(ConflictException);
    await expect(
      org.registriere(await login('ops@rent2cool.example', ['ops']), {
        firmenname: 'X',
        land: 'DE',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('Firmendaten: vor der Freigabe frei, danach Identität nur durch Rent2Cool', async () => {
    const ben = await erneut(
      await (async () => {
        const p = await login(`ben-${randomUUID().slice(0, 6)}@kunde.example`);
        await org.registriere(p, { firmenname: 'Vorher GmbH', land: 'DE' });
        return p;
      })(),
    );
    let o = await org.organisation(ben);
    await org.aendere(ben, { version: o.version, firmenname: 'Nachher GmbH' });
    o = await org.organisation(ben);
    expect(o.kunde.firmenname).toBe('Nachher GmbH');
    expect(o.freigegeben).toBe(false);

    const intern: Principal = { akteurId: 'test-intern', rollen: ['admin'], mandantId };
    await kunden.aendereKundeStatus(intern, ben.kundeId!, 'freigegeben');
    o = await org.organisation(ben);
    expect(o.freigegeben).toBe(true);
    await expect(org.aendere(ben, { version: o.version, ustId: 'DE999999999' })).rejects.toThrow(
      ConflictException,
    );
    await org.aendere(ben, { version: o.version, ort: 'Neustadt' });
    expect((await org.organisation(ben)).kunde.ort).toBe('Neustadt');
  });

  it('Einladung: Code nur per Mail, nur Hash gespeichert, nur die eingeladene E-Mail löst ein', async () => {
    const chef = await login(`chef-${randomUUID().slice(0, 6)}@kunde.example`);
    const { kundeId } = await org.registriere(chef, { firmenname: 'Einlade GmbH', land: 'DE' });
    const verwalter = await erneut(chef);
    const email = `qa-${randomUUID().slice(0, 6)}@kunde.example`;

    await org.ladeEin(verwalter, { email, rollen: ['kunde_qa'] });
    const m = mail.gesendet.at(-1)!;
    expect(m.an).toBe(email);
    expect(m.text).toContain('http://portal.test/einladung?code=');
    const code = codeAus(m.text);
    const [gespeichert] = await client.db
      .select()
      .from(kundeEinladung)
      .where(eq(kundeEinladung.kundeId, kundeId));
    expect(gespeichert!.codeHash).not.toContain(code);
    const audit = await client.db
      .select()
      .from(auditEvent)
      .where(
        and(eq(auditEvent.entitaetId, kundeId), eq(auditEvent.entitaetTyp, 'kunde_einladung')),
      );
    expect(JSON.stringify(audit)).not.toContain(code);

    await expect(org.ladeEin(verwalter, { email, rollen: ['kunde_qa'] })).rejects.toThrow(
      'bereits eine offene Einladung',
    );
    // Weitergeleiteter Link: andere E-Mail → abgelehnt.
    await expect(org.nehmeAn(await login('fremd@anders.example'), code)).rejects.toThrow(
      ForbiddenException,
    );
    const qa = await login(email);
    expect(await org.nehmeAn(qa, code)).toEqual({ kundeId, rollen: ['kunde_qa'] });
    const qaAngemeldet = await erneut(qa);
    expect(qaAngemeldet).toMatchObject({ kundeId, rollen: ['kunde_qa'] });
    // Einmal einlösbar; QA darf nicht einladen; schon Mitglied → keine neue Einladung.
    await expect(org.nehmeAn(await login(email), code)).rejects.toThrow(NotFoundException);
    await expect(
      org.ladeEin(qaAngemeldet, { email: 'x@y.example', rollen: ['kunde_qa'] }),
    ).rejects.toThrow(ForbiddenException);
    await expect(org.ladeEin(verwalter, { email, rollen: ['kunde_dispo'] })).rejects.toThrow(
      'gehört bereits zur Organisation',
    );

    // Widerrufene Einladung lässt sich nicht mehr einlösen.
    const email2 = `dispo-${randomUUID().slice(0, 6)}@kunde.example`;
    const { id } = await org.ladeEin(verwalter, { email: email2, rollen: ['kunde_dispo'] });
    const code2 = codeAus(mail.gesendet.at(-1)!.text);
    expect((await org.organisation(verwalter)).einladungen.map((e) => e.email)).toEqual([email2]);
    await org.widerrufeEinladung(verwalter, id);
    await expect(org.nehmeAn(await login(email2), code2)).rejects.toThrow(NotFoundException);

    // Abgelaufene Einladung: nicht mehr einlösbar, blockiert aber keine neue.
    const email3 = `spaet-${randomUUID().slice(0, 6)}@kunde.example`;
    const alt = await org.ladeEin(verwalter, { email: email3, rollen: ['kunde_qa'] });
    const code3 = codeAus(mail.gesendet.at(-1)!.text);
    await client.db
      .update(kundeEinladung)
      .set({ gueltigBis: new Date(Date.now() - 1000) })
      .where(eq(kundeEinladung.id, alt.id));
    await expect(org.nehmeAn(await login(email3), code3)).rejects.toThrow(NotFoundException);
    expect((await org.organisation(verwalter)).einladungen).toEqual([]);
    const neu = await org.ladeEin(verwalter, { email: email3, rollen: ['kunde_qa'] });
    expect(neu.id).not.toBe(alt.id);
    const [ersetzt] = await client.db
      .select()
      .from(kundeEinladung)
      .where(eq(kundeEinladung.id, alt.id));
    expect(ersetzt!.widerrufenAm).not.toBeNull();
  });

  it('Mitglieder: Rollen ändern und entfernen – mindestens ein Verwalter bleibt', async () => {
    const a = await login(`a-${randomUUID().slice(0, 6)}@kunde.example`);
    const { kundeId } = await org.registriere(a, { firmenname: 'Team GmbH', land: 'DE' });
    const va = await erneut(a);
    await expect(org.aendereRollen(va, a.akteurId, ['kunde_dispo'])).rejects.toThrow(
      'Mindestens eine Person muss die Organisation verwalten',
    );
    await expect(org.entferneMitglied(va, a.akteurId)).rejects.toThrow('Mindestens eine Person');

    const emailB = `b-${randomUUID().slice(0, 6)}@kunde.example`;
    await org.ladeEin(va, { email: emailB, rollen: ['kunde_dispo'] });
    const b = await login(emailB);
    await org.nehmeAn(b, codeAus(mail.gesendet.at(-1)!.text));
    await org.aendereRollen(va, b.akteurId, ['kunde_admin', 'kunde_dispo']);
    // Jetzt darf A gehen; B verwaltet.
    await org.entferneMitglied(await erneut(b), a.akteurId);
    const rest = await client.db.select().from(kundeKonto).where(eq(kundeKonto.kundeId, kundeId));
    expect(rest.map((r) => r.kontoId)).toEqual([b.akteurId]);
    expect((await erneut(a)).kundeId).toBeUndefined();
    // Fremde Organisation: Mitglied „nicht gefunden“.
    await expect(org.entferneMitglied(await erneut(b), `konto-${randomUUID()}`)).rejects.toThrow(
      NotFoundException,
    );
  });
});
