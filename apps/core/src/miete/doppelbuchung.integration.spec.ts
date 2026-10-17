/**
 * Integrationstest Doppelbuchung gegen die echte DB: Gleichzeitige Buchungen
 * desselben Fahrzeugs im selben Zeitraum – genau eine gewinnt, auch wenn die
 * Vorabprüfung beide durchlässt. Die Regel liegt in der Datenbank
 * (ex_miete_fahrzeug_zeitraum) und gilt auch am Kern vorbei.
 * Eigener Mandant je Lauf. Nur mit RUN_INTEGRATION=1.
 */
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@rent2cool/shared';
import { BerichtService } from '../bericht/bericht.service';
import { KonfigProfilQuelle } from '../bericht/profil';
import { JsonNachweisRenderer, RendererRegistry } from '../bericht/renderer';
import { HmacSignierer } from '../bericht/signierer';
import { InMemoryBerichtSpeicher } from '../bericht/speicher';
import { createDbClient } from '../db/client';
import { auditEvent, mandant, miete } from '../db/schema';
import { FahrzeugService } from '../fahrzeug/fahrzeug.service';
import { KundeService } from '../kunde/kunde.service';
import { MieteService } from './miete.service';

const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ??
  'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool_test';
const STUNDE = 3_600_000;

/**
 * Ohne Vorabprüfung: simuliert, dass gleichzeitige Anfragen alle an der
 * Prüfung vorbeikommen. Dann schützt nur noch die Datenbank-Regel.
 */
class MieteServiceOhneVorabpruefung extends MieteService {
  override async pruefeBuchung(): Promise<string[]> {
    return [];
  }
}

describe.skipIf(!RUN)('Doppelbuchung (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;
  let fahrzeuge: FahrzeugService;
  let kunden: KundeService;
  let mieten: MieteService;
  let ohnePruefung: MieteService;
  const mandantId = randomUUID();
  const ops: Principal = {
    akteurId: `test-doppel-${randomUUID().slice(0, 8)}`,
    rollen: ['ops'],
    mandantId,
  };
  /** Fester Bezugspunkt in der Zukunft, volle Stunde. */
  const basis = Math.ceil((Date.now() + 48 * STUNDE) / STUNDE) * STUNDE;
  const zeit = (h: number) => new Date(basis + h * STUNDE).toISOString();

  async function buchbaresFahrzeugUndKunde() {
    const { id: fahrzeugId } = await fahrzeuge.erstelle(ops, {
      kennzeichen: `DB-${randomUUID().slice(0, 8)}`,
      zulGesamtmasseKg: 3500,
      benoetigteFuehrerscheinklasse: 'B',
      hatFahrtenschreiber: false,
      aggregat: { sensoren: [{ messgroesse: 'temperatur_laderaum', einheit: 'C' }] },
    });
    const sensorId = (await fahrzeuge.holeAkte(fahrzeugId)).aggregate[0]!.sensoren[0]!.id;
    await fahrzeuge.fuegeKalibrierungHinzu(ops, sensorId, {
      durchgefuehrtAm: new Date().toISOString(),
      gueltigBis: new Date(Date.now() + 365 * 24 * STUNDE).toISOString(),
    });
    await fahrzeuge.aendereStatus(ops, fahrzeugId, 'verfuegbar');
    const { id: kundeId } = await kunden.erstelleKunde(ops, {
      firmenname: 'Doppelkunde',
      land: 'DE',
    });
    await kunden.aendereKundeStatus(ops, kundeId, 'in_pruefung');
    await kunden.aendereKundeStatus(ops, kundeId, 'freigegeben');
    return { fahrzeugId, kundeId };
  }

  const buchung = (
    f: { fahrzeugId: string; kundeId: string },
    von: number,
    bis: number,
    key?: string,
  ) => ({
    kundeId: f.kundeId,
    fahrzeugId: f.fahrzeugId,
    auslandsfahrtGeplant: false,
    startGeplant: zeit(von),
    endeGeplant: zeit(bis),
    ...(key ? { idempotencyKey: key } : {}),
  });

  async function mietenDesFahrzeugs(fahrzeugId: string) {
    return client.db.select().from(miete).where(eq(miete.fahrzeugId, fahrzeugId));
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
    ohnePruefung = new MieteServiceOhneVorabpruefung(client.db, fahrzeuge, kunden, berichte);
    await client.db.insert(mandant).values({ id: mandantId, name: 'Test-Mandant Doppelbuchung' });
  });
  afterAll(async () => {
    await client.sql.end({ timeout: 5 });
  });

  it('fünf gleichzeitige Buchungen für überlappende Zeiträume: genau eine wird bestätigt', async () => {
    const f = await buchbaresFahrzeugUndKunde();
    const ergebnisse = await Promise.allSettled([
      mieten.erstelle(ops, buchung(f, 0, 10)),
      mieten.erstelle(ops, buchung(f, 2, 12)),
      mieten.erstelle(ops, buchung(f, 5, 6)),
      mieten.erstelle(ops, buchung(f, 9, 20)),
      mieten.erstelle(ops, buchung(f, 0, 10)),
    ]);
    expect(ergebnisse.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    for (const e of ergebnisse.filter((x): x is PromiseRejectedResult => x.status === 'rejected')) {
      expect(e.reason).toBeInstanceOf(ConflictException);
      expect((e.reason as ConflictException).getResponse()).toMatchObject({
        fehler: 'Buchung abgelehnt',
        gruende: ['Fahrzeug ist im gewünschten Zeitraum bereits gebucht'],
      });
    }
    const vorhanden = await mietenDesFahrzeugs(f.fahrzeugId);
    expect(vorhanden).toHaveLength(1);
    // Nur die angelegte Miete steht im Audit Trail.
    const audit = await client.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.entitaetTyp, 'miete'), eq(auditEvent.akteurId, ops.akteurId)));
    expect(
      audit.filter((a) => (a.neuWert as { fahrzeugId?: string }).fahrzeugId === f.fahrzeugId),
    ).toHaveLength(1);
  });

  it('auch wenn alle an der Vorabprüfung vorbeikommen: genau eine, Rest sauber abgelehnt', async () => {
    const f = await buchbaresFahrzeugUndKunde();
    const ergebnisse = await Promise.allSettled(
      [0, 1, 2, 3, 4].map((i) => ohnePruefung.erstelle(ops, buchung(f, i, i + 5))),
    );
    expect(ergebnisse.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    for (const e of ergebnisse.filter((x): x is PromiseRejectedResult => x.status === 'rejected')) {
      expect((e.reason as ConflictException).getResponse()).toMatchObject({
        gruende: ['Fahrzeug ist im gewünschten Zeitraum bereits gebucht'],
      });
    }
    expect(await mietenDesFahrzeugs(f.fahrzeugId)).toHaveLength(1);
  });

  it('angrenzende Zeiträume (Rückgabe = nächste Abholung) sind erlaubt', async () => {
    const f = await buchbaresFahrzeugUndKunde();
    await mieten.erstelle(ops, buchung(f, 0, 2));
    await mieten.erstelle(ops, buchung(f, 2, 4));
    expect(await mietenDesFahrzeugs(f.fahrzeugId)).toHaveLength(2);
  });

  it('gleichzeitige Wiederholung mit demselben Idempotency-Key liefert dieselbe Miete', async () => {
    const f = await buchbaresFahrzeugUndKunde();
    const key = randomUUID();
    const [a, b] = await Promise.all([
      mieten.erstelle(ops, buchung(f, 0, 3, key)),
      mieten.erstelle(ops, buchung(f, 0, 3, key)),
    ]);
    expect(a.id).toBe(b.id);
    expect([a.idempotent, b.idempotent].sort()).toEqual([false, true]);
    expect(await mietenDesFahrzeugs(f.fahrzeugId)).toHaveLength(1);
  });

  it('stornierte Mieten blockieren nicht; Statuswechsel in eine Überschneidung wird abgelehnt', async () => {
    const f = await buchbaresFahrzeugUndKunde();
    const erste = await mieten.erstelle(ops, buchung(f, 0, 5));
    await mieten.aendereStatus(ops, erste.id, 'storniert');
    const zweite = await mieten.erstelle(ops, buchung(f, 1, 4));
    expect(zweite.status).toBe('bestaetigt');

    // Angefragte Miete (blockiert noch nicht) im selben Zeitraum – Bestätigen muss scheitern.
    const [angefragt] = await client.db
      .insert(miete)
      .values({
        mandantId,
        kundeId: f.kundeId,
        fahrzeugId: f.fahrzeugId,
        startGeplant: new Date(zeit(2)),
        endeGeplant: new Date(zeit(3)),
        status: 'angefragt',
      })
      .returning({ id: miete.id });
    await expect(mieten.aendereStatus(ops, angefragt!.id, 'bestaetigt')).rejects.toThrow(
      ConflictException,
    );
    expect((await mieten.holeMiete(angefragt!.id)).status).toBe('angefragt');
  });

  it('die Datenbank lehnt Überschneidungen auch am Kern vorbei ab', async () => {
    const f = await buchbaresFahrzeugUndKunde();
    await mieten.erstelle(ops, buchung(f, 0, 5));
    await expect(
      client.db.insert(miete).values({
        mandantId,
        kundeId: f.kundeId,
        fahrzeugId: f.fahrzeugId,
        startGeplant: new Date(zeit(4)),
        endeGeplant: new Date(zeit(8)),
        status: 'bestaetigt',
      }),
    ).rejects.toMatchObject({ code: '23P01', constraint_name: 'ex_miete_fahrzeug_zeitraum' });
  });
});
