/**
 * Integrationstest Alarme & Abweichungen gegen die echte DB. Nur mit
 * RUN_INTEGRATION=1.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TelemetrieNachricht } from '@rent2cool/shared';
import { createDbClient } from '../db/client';
import { mandant } from '../db/schema';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';
import { FahrzeugService } from '../fahrzeug/fahrzeug.service';
import { AbweichungService } from './abweichung.service';
import { AlarmService } from './alarm.service';

const RUN = process.env.RUN_INTEGRATION === '1';
const url =
  process.env.DATABASE_URL ?? 'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool';
const profil = { name: '2-8', minC: 2, maxC: 8 };

describe.skipIf(!RUN)('Alarme & Abweichungen (Integration, braucht DB)', () => {
  let client: ReturnType<typeof createDbClient>;
  let alarme: AlarmService;
  let abweichungen: AbweichungService;
  let fahrzeuge: FahrzeugService;

  beforeAll(async () => {
    client = createDbClient(url);
    alarme = new AlarmService(client.db);
    abweichungen = new AbweichungService(client.db);
    fahrzeuge = new FahrzeugService(client.db);
    await client.db.insert(mandant).values({ id: PLACEHOLDER_MANDANT_ID, name: 'Test' }).onConflictDoNothing();
  });
  afterAll(async () => {
    await client.sql.end({ timeout: 5 });
  });

  async function fahrzeugId(): Promise<string> {
    const { id } = await fahrzeuge.erstelle(undefined, {
      kennzeichen: `A-${randomUUID().slice(0, 8)}`,
      zulGesamtmasseKg: 3500,
      benoetigteFuehrerscheinklasse: 'B',
      hatFahrtenschreiber: false,
    });
    return id;
  }

  function nachricht(fz: string): TelemetrieNachricht {
    return {
      nachrichtId: randomUUID(),
      fahrzeugId: fz,
      quelle: 'test',
      gesendetAm: new Date().toISOString(),
      messwerte: [
        { messgroesse: 'temperatur_laderaum', wert: 9.5, einheit: 'C' }, // über 8
        { messgroesse: 'tuer_offen', wert: 1, einheit: 'bool' },
      ],
    };
  }

  it('erzeugt Alarme aus einer Nachricht, idempotent, und quittiert/schließt', async () => {
    const fz = await fahrzeugId();
    const n = nachricht(fz);

    const erstmals = await alarme.auswerteNachricht(n, profil, { mandantId: PLACEHOLDER_MANDANT_ID });
    expect(erstmals).toBe(2); // temperatur_ueber + tuer_offen

    // Neuauswertung derselben Nachricht -> keine neuen Alarme (idempotent).
    const nochmal = await alarme.auswerteNachricht(n, profil, { mandantId: PLACEHOLDER_MANDANT_ID });
    expect(nochmal).toBe(0);

    const liste = await alarme.liste(PLACEHOLDER_MANDANT_ID, { fahrzeugId: fz, limit: 50, offset: 0 });
    expect(liste.gesamt).toBe(2);

    const alarmId = liste.eintraege[0]!.id;
    expect((await alarme.quittiere(alarmId, 'ops-user')).status).toBe('quittiert');
    expect((await alarme.schliesse(alarmId)).status).toBe('geschlossen');
  });

  it('führt eine Abweichung durch das CAPA-Verfahren', async () => {
    const fz = await fahrzeugId();
    await alarme.auswerteNachricht(nachricht(fz), profil, { mandantId: PLACEHOLDER_MANDANT_ID });
    const liste = await alarme.liste(PLACEHOLDER_MANDANT_ID, { fahrzeugId: fz, limit: 1, offset: 0 });

    const { id } = await abweichungen.erstelle(undefined, {
      bezugTyp: 'alarm',
      bezugId: liste.eintraege[0]!.id,
      beschreibung: 'Temperatur über Grenze während Transport',
      schweregrad: 'hoch',
    });
    await abweichungen.aendereStatus(id, 'in_bewertung', {});
    await abweichungen.aendereStatus(id, 'bewertet', { bewertung: 'Kühlkette kurz unterbrochen' });
    await abweichungen.aendereStatus(id, 'geschlossen', { massnahmen: 'Ware geprüft, freigegeben', verantwortlich: 'qa-user' });
    const a = await abweichungen.hole(id);
    expect(a.status).toBe('geschlossen');
    expect(a.geschlossenAm).not.toBeNull();
  });

  it('verweigert einen unerlaubten Abweichungs-Übergang', async () => {
    const { id } = await abweichungen.erstelle(undefined, {
      bezugTyp: 'fahrzeug',
      bezugId: randomUUID(),
      beschreibung: 'Test',
    });
    await expect(abweichungen.aendereStatus(id, 'geschlossen', {})).rejects.toThrow();
  });
});
