/**
 * Demo-Daten für Vorführungen laden (D-015: nur erfundene Testdaten).
 * Aufruf:  pnpm --filter @rent2cool/core db:seed:demo
 *
 * Alles läuft über die echten Services – Regeln, Audit Trail (Akteur
 * „Demo-Daten“), Telematik-Verarbeitung und Alarm-Auswertung wie im Betrieb.
 * Nur vergangene und laufende Mieten werden direkt mit ihren historischen
 * Zeiten angelegt (ein Statuswechsel würde „jetzt“ als Zeitpunkt setzen);
 * auch sie stehen mit ihrem vollständigen Datensatz im Audit Trail.
 *
 * Einmalig je Datenbank: Sind die Demo-Daten schon da, passiert nichts.
 * Für eine frische Vorführung: `docker compose down -v`, dann Migrationen,
 * `db:seed` und `db:seed:demo`.
 */
import { ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { STANDARD_TEMPERATURPROFILE, type Principal } from '@rent2cool/shared';
import { AbweichungService } from '../../alarm/abweichung.service';
import { AlarmService } from '../../alarm/alarm.service';
import { protokolliereAnlage } from '../../audit/audit.service';
import { BerichtService } from '../../bericht/bericht.service';
import { KonfigProfilQuelle } from '../../bericht/profil';
import { JsonNachweisRenderer, RendererRegistry } from '../../bericht/renderer';
import { HmacSignierer } from '../../bericht/signierer';
import { InMemoryBerichtSpeicher } from '../../bericht/speicher';
import type { Env } from '../../config/env';
import { FahrzeugService } from '../../fahrzeug/fahrzeug.service';
import { KundeService } from '../../kunde/kunde.service';
import { MieteService } from '../../miete/miete.service';
import { RechnungService } from '../../rechnung/rechnung.service';
import { SimulatorKeyProvider } from '../../schluessel/key-provider';
import { SchluesselService } from '../../schluessel/schluessel.service';
import { StandortService } from '../../standort/standort.service';
import { pruefeUebergabe } from '../../standort/uebergabe';
import { verarbeiteNachricht } from '../../telemetry/processor';
import { createDbClient, type Database } from '../client';
import { alarm, kunde, mandant, miete } from '../schema';
import {
  DEMO_AKTEUR_ID,
  DEMO_FAHRZEUGE,
  DEMO_KUNDEN,
  DEMO_MARKER_KUNDE,
  DEMO_MIETEN,
  DEMO_STANDORTE,
  positionsNachricht,
  type DemoMiete,
  relativ,
  temperaturVerlauf,
  versetzt,
} from './demo-daten';
import { PLACEHOLDER_MANDANT_ID } from './placeholder-data';

const TAG = 86_400_000;

export interface DemoErgebnis {
  bereitsVorhanden: boolean;
  fahrzeuge: number;
  kunden: number;
  fahrer: number;
  mieten: number;
  messwerte: number;
  alarme: number;
  rechnungen: number;
  standorte: number;
  schluessel: number;
  befehle: number;
}

export async function ladeDemoDaten(
  db: Database,
  o: { mandantId?: string; jetzt?: Date } = {},
): Promise<DemoErgebnis> {
  const mandantId = o.mandantId ?? PLACEHOLDER_MANDANT_ID;
  const jetzt = o.jetzt ?? new Date();
  const ergebnis: DemoErgebnis = {
    bereitsVorhanden: false,
    fahrzeuge: 0,
    kunden: 0,
    fahrer: 0,
    mieten: 0,
    messwerte: 0,
    alarme: 0,
    rechnungen: 0,
    standorte: 0,
    schluessel: 0,
    befehle: 0,
  };

  const [vorhanden] = await db
    .select({ id: kunde.id })
    .from(kunde)
    .where(and(eq(kunde.mandantId, mandantId), eq(kunde.firmenname, DEMO_MARKER_KUNDE)));
  if (vorhanden) {
    return { ...ergebnis, bereitsVorhanden: true };
  }
  await db
    .insert(mandant)
    .values({ id: mandantId, name: 'Rent2Cool (Platzhalter-Mandant)' })
    .onConflictDoNothing();

  const akteur: Principal = {
    akteurId: DEMO_AKTEUR_ID,
    name: 'Demo-Daten',
    rollen: ['admin'],
    mandantId,
  };
  const config = {
    get: (k: string) => (k === 'RECHNUNG_STEUERSATZ' ? 19 : 'EUR'),
  } as unknown as ConfigService<Env, true>;
  const fahrzeuge = new FahrzeugService(db);
  const kunden = new KundeService(db);
  const berichte = new BerichtService(
    db,
    new KonfigProfilQuelle(),
    new HmacSignierer('demo-nur-lokal'),
    new RendererRegistry([new JsonNachweisRenderer()]),
    new InMemoryBerichtSpeicher(),
  );
  const schluesselDienst = new SchluesselService(db, new SimulatorKeyProvider(), kunden);
  const mieten = new MieteService(db, fahrzeuge, kunden, berichte, schluesselDienst);
  const rechnungen = new RechnungService(db, config, mieten);
  const alarme = new AlarmService(db);
  const abweichungen = new AbweichungService(db);

  /** App-Konten sind systemweit eindeutig – je Mandant eine eigene Demo-Kennung. */
  const demoKonto = (konto: string) => `${konto}-${mandantId.slice(0, 8)}`;

  // --- Standorte (D-011) ---
  const standortIds = new Map<string, string>();
  const standorte = new StandortService(db);
  for (const st of DEMO_STANDORTE) {
    const { id } = await standorte.erstelle(akteur, {
      name: st.name,
      strasse: st.strasse,
      plz: st.plz,
      ort: st.ort,
      land: 'DE',
      geofenceLat: st.geofence.lat,
      geofenceLng: st.geofence.lng,
      geofenceRadiusM: st.geofence.radiusM,
      oeffnungsregeln: st.oeffnungsregeln,
    });
    standortIds.set(st.schluessel, id);
    ergebnis.standorte++;
  }

  // --- Fahrzeuge mit Kühlaufbau, Sensor und Kalibrierung ---
  const fahrzeugIds = new Map<string, string>();
  for (const f of DEMO_FAHRZEUGE) {
    const { id } = await fahrzeuge.erstelle(akteur, {
      standortId: standortIds.get(f.standort),
      kennzeichen: f.kennzeichen,
      vin: `DEMO${f.kennzeichen.replace(/\D/g, '').padStart(13, '0')}`,
      zulGesamtmasseKg: f.zulGesamtmasseKg,
      benoetigteFuehrerscheinklasse: f.klasse,
      hatFahrtenschreiber: f.hatFahrtenschreiber,
      standardTemperaturprofil: f.profil,
      aggregat: {
        typ: 'Kühlkoffer',
        hersteller: 'Demo-Kältetechnik',
        sensoren: [
          {
            messgroesse: 'temperatur_laderaum',
            einheit: 'C',
            modell: 'Demo-Logger EN 12830',
            seriennummer: f.sensorSeriennummer,
          },
        ],
      },
    });
    const sensorId = (await fahrzeuge.holeAkte(id)).aggregate[0]!.sensoren[0]!.id;
    await fahrzeuge.fuegeKalibrierungHinzu(akteur, sensorId, {
      durchgefuehrtAm: new Date(jetzt.getTime() - 30 * TAG).toISOString(),
      gueltigBis: new Date(jetzt.getTime() + f.kalibrierungTage * TAG).toISOString(),
      pruefstelle: 'Demo-Prüflabor',
      zertifikatRef: `DEMO-KAL-${f.kennzeichen}`,
      ergebnis: 'bestanden',
    });
    await fahrzeuge.aendereStatus(akteur, id, 'verfuegbar');
    fahrzeugIds.set(f.schluessel, id);
    ergebnis.fahrzeuge++;
  }

  // --- Kunden und Fahrer mit Prüfung ---
  const kundenIds = new Map<string, string>();
  const fahrerIds = new Map<string, string[]>();
  for (const k of DEMO_KUNDEN) {
    const { id } = await kunden.erstelleKunde(akteur, {
      firmenname: k.firmenname,
      handelsregisternummer: k.handelsregisternummer,
      ustId: k.ustId,
      strasse: k.strasse,
      plz: k.plz,
      ort: k.ort,
      land: 'DE',
    });
    await kunden.aendereKundeStatus(akteur, id, 'in_pruefung');
    if (k.status === 'freigegeben') await kunden.aendereKundeStatus(akteur, id, 'freigegeben');
    const ids: string[] = [];
    for (const f of k.fahrer) {
      const { id: fahrerId } = await kunden.erstelleFahrer(akteur, id, {
        name: f.name,
        fuehrerscheinKlasse: f.klasse,
        fuehrerscheinNummer: `DEMO-FS-${ids.length + 1}${k.schluessel.toUpperCase()}`,
        fuehrerscheinGueltigBis: new Date(jetzt.getTime() + f.gueltigTage * TAG).toISOString(),
      });
      await kunden.aendereFahrerStatus(akteur, fahrerId, 'identitaet_pruefung');
      await kunden.aendereFahrerStatus(akteur, fahrerId, 'freigegeben');
      if (f.konto) {
        const vorher = await kunden.holeFahrer(fahrerId);
        await kunden.aendereFahrer(akteur, fahrerId, {
          version: vorher.aktualisiertAm.toISOString(),
          kontoId: demoKonto(f.konto),
        });
      }
      ids.push(fahrerId);
      ergebnis.fahrer++;
    }
    kundenIds.set(k.schluessel, id);
    fahrerIds.set(k.schluessel, ids);
    ergebnis.kunden++;
  }

  // --- Digitaler Schlüssel (D-014): ausstellen, dann Befehle mit dem Fahrer-Login ---
  async function digitalerSchluessel(m: DemoMiete, mieteId: string, fahrerId: string) {
    if (!m.digitalerSchluessel) return;
    const { id } = await schluesselDienst.stelleAus(akteur, mieteId, fahrerId);
    ergebnis.schluessel++;
    const f = DEMO_KUNDEN.find((k) => k.schluessel === m.kunde)!.fahrer[m.fahrer]!;
    const fahrerLogin: Principal = {
      akteurId: demoKonto(f.konto!),
      name: f.name,
      rollen: ['fahrer'],
      mandantId,
    };
    for (const [i, befehl] of m.digitalerSchluessel.befehle.entries()) {
      try {
        await schluesselDienst.befehlMitSchluessel(fahrerLogin, id, {
          befehl,
          idempotencyKey: `demo-${mandantId.slice(0, 8)}-${m.schluessel}-${i}`,
        });
      } catch (e) {
        if (!(e instanceof ConflictException)) throw e; // abgelehnt: steht im Protokoll
      }
      ergebnis.befehle++;
    }
  }

  // --- Mieten ---
  for (const m of DEMO_MIETEN) {
    const fahrzeugId = fahrzeugIds.get(m.fahrzeug)!;
    const kundeId = kundenIds.get(m.kunde)!;
    const fahrerId = fahrerIds.get(m.kunde)![m.fahrer]!;
    const demoFahrzeug = DEMO_FAHRZEUGE.find((f) => f.schluessel === m.fahrzeug)!;
    const profilName = demoFahrzeug.profil;
    // Abholung und Rückgabe am Heimatstandort des Fahrzeugs (D-011).
    const standortId = standortIds.get(demoFahrzeug.standort)!;
    const start = relativ(jetzt, m.startStunden);
    const ende = relativ(jetzt, m.endeStunden);

    if (m.status === 'bestaetigt') {
      // Künftige Buchung: normaler Weg mit allen Buchungsregeln.
      const { id: kuenftigId } = await mieten.erstelle(akteur, {
        kundeId,
        fahrzeugId,
        fahrerId,
        auslandsfahrtGeplant: false,
        temperaturprofil: profilName,
        standortAbholId: standortId,
        standortRueckgabeId: standortId,
        startGeplant: start.toISOString(),
        endeGeplant: ende.toISOString(),
      });
      ergebnis.mieten++;
      await digitalerSchluessel(m, kuenftigId, fahrerId);
      continue;
    }

    // Positionen bei Übergabe, Rückgabe bzw. jetzt (unterwegs) – durch die
    // Telematik-Verarbeitung; die Prüfungen rechnet derselbe Code wie im Betrieb.
    const geo = DEMO_STANDORTE.find((st) => st.schluessel === demoFahrzeug.standort)!.geofence;
    await verarbeiteNachricht(db, positionsNachricht(fahrzeugId, start, versetzt(geo, 30, 10)));
    if (m.status === 'beendet') {
      await verarbeiteNachricht(
        db,
        positionsNachricht(fahrzeugId, ende, versetzt(geo, m.rueckgabeAbstandM ?? 40, 0)),
      );
    } else {
      const vorKurzem = new Date(jetzt.getTime() - 2 * 60_000);
      await verarbeiteNachricht(
        db,
        positionsNachricht(fahrzeugId, vorKurzem, versetzt(geo, m.aktuellAbstandM ?? 0, 0)),
      );
    }
    const uebergabePruefung = await pruefeUebergabe(db, mandantId, fahrzeugId, standortId, start);
    const rueckgabePruefung =
      m.status === 'beendet'
        ? await pruefeUebergabe(db, mandantId, fahrzeugId, standortId, ende)
        : null;

    // Vergangene/laufende Miete mit ihren historischen Zeiten.
    const mieteId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(miete)
        .values({
          mandantId,
          kundeId,
          fahrzeugId,
          fahrerId,
          standortAbholId: standortId,
          standortRueckgabeId: standortId,
          startGeplant: start,
          endeGeplant: ende,
          startIst: start,
          endeIst: m.status === 'beendet' ? ende : null,
          auslandsfahrtGeplant: false,
          temperaturprofil: profilName,
          status: m.status,
          uebergabePruefung,
          rueckgabePruefung,
        })
        .returning();
      await protokolliereAnlage(tx, akteur, 'miete', row!.id, row);
      return row!.id;
    });
    ergebnis.mieten++;

    // Laderaumtemperatur bis Mietende bzw. bis jetzt – durch die echte Verarbeitung.
    const profil = STANDARD_TEMPERATURPROFILE.find((p) => p.name === profilName)!;
    const nachrichten = temperaturVerlauf({
      fahrzeugId,
      von: start,
      bis: new Date(Math.min(ende.getTime(), jetzt.getTime())),
      profil,
      saat: ergebnis.mieten,
      ausreisser: m.ausreisser,
    });
    for (const n of nachrichten) {
      if ((await verarbeiteNachricht(db, n)) === 'gespeichert')
        ergebnis.messwerte += n.messwerte.length;
      ergebnis.alarme += await alarme.auswerteNachricht(n, profil, { mandantId, mieteId });
    }

    if (m.status === 'aktiv') {
      await fahrzeuge.aendereStatus(akteur, fahrzeugId, 'reserviert');
      await fahrzeuge.aendereStatus(akteur, fahrzeugId, 'vermietet');
      await digitalerSchluessel(m, mieteId, fahrerId);
      continue;
    }

    // Abgeschlossener Ausreißer: Alarme bearbeitet, Abweichung bewertet und geschlossen.
    if (m.ausreisser) {
      const zurMiete = await db
        .select({ id: alarm.id })
        .from(alarm)
        .where(eq(alarm.mieteId, mieteId));
      for (const a of zurMiete) {
        await alarme.quittiere(akteur, a.id);
        await alarme.schliesse(akteur, a.id);
      }
      const { id: abwId } = await abweichungen.erstelle(akteur, {
        bezugTyp: 'miete',
        bezugId: mieteId,
        beschreibung: `Laderaumtemperatur ${m.ausreisser.dauerMin} Min. über 8 °C (Spitze ${m.ausreisser.spitzeC.toLocaleString('de-DE')} °C) nach längerem Türöffnen bei einer Anlieferung.`,
        schweregrad: 'mittel',
      });
      await abweichungen.aendereStatus(akteur, abwId, 'in_bewertung', {});
      await abweichungen.aendereStatus(akteur, abwId, 'bewertet', {
        bewertung:
          'Kurze Überschreitung, Ware laut Stabilitätsdaten des Kunden nicht beeinträchtigt (Demo-Bewertung).',
      });
      await abweichungen.aendereStatus(akteur, abwId, 'geschlossen', {
        massnahmen: 'Fahrer zum Türöffnen beim Be- und Entladen nachgeschult.',
        verantwortlich: 'QA (Demo)',
      });
    }

    if (m.rechnung) {
      const r = await rechnungen.erstelle(akteur, { mieteId, netto: m.rechnung.netto });
      if (m.rechnung.status !== 'entwurf') await rechnungen.aendereStatus(akteur, r.id, 'gestellt');
      if (m.rechnung.status === 'bezahlt') await rechnungen.aendereStatus(akteur, r.id, 'bezahlt');
      ergebnis.rechnungen++;
    }
  }

  // Fahrzeuge, die nicht unterwegs sind, stehen jetzt an ihrem Standort.
  const unterwegs = new Set(DEMO_MIETEN.filter((m) => m.status === 'aktiv').map((m) => m.fahrzeug));
  for (const f of DEMO_FAHRZEUGE) {
    if (unterwegs.has(f.schluessel)) continue;
    const geo = DEMO_STANDORTE.find((st) => st.schluessel === f.standort)!.geofence;
    await verarbeiteNachricht(
      db,
      positionsNachricht(
        fahrzeugIds.get(f.schluessel)!,
        new Date(jetzt.getTime() - 3 * 60_000),
        versetzt(geo, -25, 15),
      ),
    );
  }

  // Endstatus der Fahrzeuge (z. B. Wartung) erst zum Schluss – Buchungen brauchen „verfügbar“.
  for (const f of DEMO_FAHRZEUGE) {
    if (f.status !== 'verfuegbar')
      await fahrzeuge.aendereStatus(akteur, fahrzeugIds.get(f.schluessel)!, f.status);
  }
  return ergebnis;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL ist nicht gesetzt.');
  }
  const { db, sql } = createDbClient(databaseUrl);
  try {
    const e = await ladeDemoDaten(db);
    if (e.bereitsVorhanden) {
      console.log('Demo-Daten sind bereits geladen – nichts zu tun.');
      return;
    }
    console.log('Demo-Daten geladen (erfundene Testdaten, D-015):');
    console.log(JSON.stringify(e, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
