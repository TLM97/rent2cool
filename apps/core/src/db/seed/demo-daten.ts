/**
 * Demo-Daten für Vorführungen – ausschließlich erfundene Testdaten (D-015).
 * Firmen tragen den Zusatz „(Demo)“, Kennzeichen beginnen mit „DEMO“, damit
 * sie nie mit echten Kunden oder Fahrzeugen verwechselt werden.
 *
 * Hier stehen nur Beschreibung und reine Funktionen; das Anlegen erledigt
 * `demo.ts` über die echten Services (Audit, Regeln, Telematik-Verarbeitung).
 * Szenarien anpassen = diese Datei ändern.
 */
import type { TelemetrieNachricht } from '@rent2cool/shared';

export const DEMO_AKTEUR_ID = 'system:demo-daten';
/** Erkennungszeichen: existiert dieser Kunde, sind die Demo-Daten schon geladen. */
export const DEMO_MARKER_KUNDE = 'Nordlicht Arzneimittel GmbH (Demo)';

const TAG = 86_400_000;
const STUNDE = 3_600_000;

export interface DemoFahrzeug {
  schluessel: string;
  kennzeichen: string;
  zulGesamtmasseKg: number;
  klasse: string;
  hatFahrtenschreiber: boolean;
  profil: '2-8' | '15-25';
  sensorSeriennummer: string;
  /** Kalibrierung gültig für so viele Tage ab heute (kurz = Frist-Warnung). */
  kalibrierungTage: number;
  /** Endstatus nach dem Laden. */
  status: 'verfuegbar' | 'wartung';
}

export const DEMO_FAHRZEUGE: readonly DemoFahrzeug[] = [
  {
    schluessel: 'f1',
    kennzeichen: 'DEMO-101',
    zulGesamtmasseKg: 3500,
    klasse: 'B',
    hatFahrtenschreiber: false,
    profil: '2-8',
    sensorSeriennummer: 'DEMO-TS-1001',
    kalibrierungTage: 300,
    status: 'verfuegbar',
  },
  {
    schluessel: 'f2',
    kennzeichen: 'DEMO-102',
    zulGesamtmasseKg: 3500,
    klasse: 'B',
    hatFahrtenschreiber: true,
    profil: '2-8',
    sensorSeriennummer: 'DEMO-TS-1002',
    kalibrierungTage: 280,
    status: 'verfuegbar',
  },
  {
    schluessel: 'f3',
    kennzeichen: 'DEMO-103',
    zulGesamtmasseKg: 3500,
    klasse: 'B',
    hatFahrtenschreiber: false,
    profil: '15-25',
    sensorSeriennummer: 'DEMO-TS-1003',
    kalibrierungTage: 12,
    status: 'verfuegbar',
  },
  {
    schluessel: 'f4',
    kennzeichen: 'DEMO-104',
    zulGesamtmasseKg: 7490,
    klasse: 'C1',
    hatFahrtenschreiber: true,
    profil: '2-8',
    sensorSeriennummer: 'DEMO-TS-1004',
    kalibrierungTage: 200,
    status: 'verfuegbar',
  },
  {
    schluessel: 'f5',
    kennzeichen: 'DEMO-105',
    zulGesamtmasseKg: 3500,
    klasse: 'B',
    hatFahrtenschreiber: false,
    profil: '2-8',
    sensorSeriennummer: 'DEMO-TS-1005',
    kalibrierungTage: 150,
    status: 'wartung',
  },
];

export interface DemoFahrer {
  name: string;
  klasse: string;
  /** Führerschein gültig für so viele Tage ab heute (kurz = Frist-Warnung). */
  gueltigTage: number;
}

export interface DemoKunde {
  schluessel: string;
  firmenname: string;
  handelsregisternummer: string;
  ustId: string;
  strasse: string;
  plz: string;
  ort: string;
  status: 'freigegeben' | 'in_pruefung';
  fahrer: readonly DemoFahrer[];
}

export const DEMO_KUNDEN: readonly DemoKunde[] = [
  {
    schluessel: 'k1',
    firmenname: DEMO_MARKER_KUNDE,
    handelsregisternummer: 'HRB 00001 (Demo)',
    ustId: 'DE000000001',
    strasse: 'Demostraße 1',
    plz: '12345',
    ort: 'Musterstadt',
    status: 'freigegeben',
    fahrer: [
      { name: 'Erika Mustermann', klasse: 'B', gueltigTage: 2000 },
      { name: 'Max Mustermann', klasse: 'C1', gueltigTage: 20 },
    ],
  },
  {
    schluessel: 'k2',
    firmenname: 'Rheinauen Klinikversorgung GmbH (Demo)',
    handelsregisternummer: 'HRB 00002 (Demo)',
    ustId: 'DE000000002',
    strasse: 'Beispielweg 7',
    plz: '54321',
    ort: 'Beispielstadt',
    status: 'freigegeben',
    fahrer: [{ name: 'Lisa Beispiel', klasse: 'B', gueltigTage: 1500 }],
  },
  {
    schluessel: 'k3',
    firmenname: 'Elbtal Biotech AG (Demo)',
    handelsregisternummer: 'HRB 00003 (Demo)',
    ustId: 'DE000000003',
    strasse: 'Probeallee 3',
    plz: '67890',
    ort: 'Probestadt',
    status: 'in_pruefung',
    fahrer: [],
  },
];

/** Ein Temperaturausreißer innerhalb einer Miete (Stunden ab Mietbeginn). */
export interface DemoAusreisser {
  abStunde: number;
  dauerMin: number;
  spitzeC: number;
}

export interface DemoMiete {
  schluessel: string;
  fahrzeug: string;
  kunde: string;
  /** Index des Fahrers beim Kunden. */
  fahrer: number;
  /** Beginn/Ende relativ zu „jetzt“ in Stunden (negativ = Vergangenheit). */
  startStunden: number;
  endeStunden: number;
  status: 'beendet' | 'aktiv' | 'bestaetigt';
  ausreisser?: DemoAusreisser;
  /** Rechnung (nur bei beendeten Mieten): Nettobetrag und Endstatus. */
  rechnung?: { netto: number; status: 'entwurf' | 'gestellt' | 'bezahlt' };
}

export const DEMO_MIETEN: readonly DemoMiete[] = [
  // Abgeschlossen, Kühlkette eingehalten, Rechnung bezahlt.
  {
    schluessel: 'm1',
    fahrzeug: 'f1',
    kunde: 'k1',
    fahrer: 0,
    startStunden: -8 * 24,
    endeStunden: -6 * 24,
    status: 'beendet',
    rechnung: { netto: 389, status: 'bezahlt' },
  },
  // Abgeschlossen mit Temperaturausreißer → Alarme, Abweichung (bewertet, geschlossen).
  {
    schluessel: 'm2',
    fahrzeug: 'f2',
    kunde: 'k2',
    fahrer: 0,
    startStunden: -4 * 24,
    endeStunden: -3 * 24,
    status: 'beendet',
    ausreisser: { abStunde: 9, dauerMin: 35, spitzeC: 9.6 },
    rechnung: { netto: 249, status: 'gestellt' },
  },
  // Abgeschlossen im Bereich 15–25 °C, Rechnung noch Entwurf.
  {
    schluessel: 'm3',
    fahrzeug: 'f3',
    kunde: 'k1',
    fahrer: 0,
    startStunden: -3 * 24,
    endeStunden: -2 * 24,
    status: 'beendet',
    rechnung: { netto: 219, status: 'entwurf' },
  },
  // Läuft gerade (seit gestern früh); vor zwei Stunden kurz zu warm → offene Alarme.
  {
    schluessel: 'm4',
    fahrzeug: 'f4',
    kunde: 'k1',
    fahrer: 1,
    startStunden: -30,
    endeStunden: 2 * 24,
    status: 'aktiv',
    ausreisser: { abStunde: 28, dauerMin: 14, spitzeC: 8.7 },
  },
  // Künftige Buchungen.
  {
    schluessel: 'm5',
    fahrzeug: 'f1',
    kunde: 'k2',
    fahrer: 0,
    startStunden: 2 * 24,
    endeStunden: 4 * 24,
    status: 'bestaetigt',
  },
  {
    schluessel: 'm6',
    fahrzeug: 'f2',
    kunde: 'k1',
    fahrer: 0,
    startStunden: 5 * 24,
    endeStunden: 6 * 24,
    status: 'bestaetigt',
  },
];

/** Deterministischer Zufall (mulberry32), damit Demo-Daten reproduzierbar sind. */
export function zufall(saat: number): () => number {
  let a = saat >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Laderaumtemperatur einmal je Minute von `von` bis `bis` (exklusive), als
 * Telematik-Nachrichten mit je bis zu 10 Werten (wie eine Box, D-003).
 * Grundwert = Mitte des Profils mit leichter Tagesschwankung und Rauschen;
 * ein optionaler Ausreißer steigt linear an, hält und fällt wieder ab.
 */
export function temperaturVerlauf(o: {
  fahrzeugId: string;
  von: Date;
  bis: Date;
  profil: { minC: number; maxC: number };
  saat: number;
  ausreisser?: DemoAusreisser;
}): TelemetrieNachricht[] {
  const r = zufall(o.saat);
  const mitte = (o.profil.minC + o.profil.maxC) / 2;
  const start = Math.ceil(o.von.getTime() / 60_000) * 60_000;
  const aStart = o.ausreisser ? o.von.getTime() + o.ausreisser.abStunde * STUNDE : Infinity;
  const aDauer = o.ausreisser ? o.ausreisser.dauerMin * 60_000 : 0;

  const nachrichten: TelemetrieNachricht[] = [];
  let werte: TelemetrieNachricht['messwerte'] = [];
  for (let t = start; t < o.bis.getTime(); t += 60_000) {
    const tagesgang = 0.6 * Math.sin(((t % TAG) / TAG) * 2 * Math.PI);
    let c = mitte + tagesgang + (r() - 0.5) * 0.4;
    if (o.ausreisser && t >= aStart && t < aStart + aDauer) {
      // Dreieck: erstes Drittel steigen, Mitte halten, letztes Drittel fallen.
      const anteil = (t - aStart) / aDauer;
      const form = anteil < 1 / 3 ? anteil * 3 : anteil > 2 / 3 ? (1 - anteil) * 3 : 1;
      c += (o.ausreisser.spitzeC - mitte) * form;
    }
    werte.push({
      messgroesse: 'temperatur_laderaum',
      wert: Math.round(c * 10) / 10,
      einheit: 'C',
      zeit: new Date(t).toISOString(),
    });
    if (werte.length === 10) {
      nachrichten.push(baueNachricht(o.fahrzeugId, werte));
      werte = [];
    }
  }
  if (werte.length > 0) nachrichten.push(baueNachricht(o.fahrzeugId, werte));
  return nachrichten;
}

function baueNachricht(
  fahrzeugId: string,
  werte: TelemetrieNachricht['messwerte'],
): TelemetrieNachricht {
  const letzte = werte[werte.length - 1]!.zeit!;
  return {
    // Stabil je Fahrzeug und Zeitpunkt: erneutes Laden erzeugt keine Duplikate.
    nachrichtId: `demo-${fahrzeugId}-${letzte}`,
    fahrzeugId,
    quelle: 'demo',
    gesendetAm: letzte,
    messwerte: werte,
  };
}

/** Zeitpunkt relativ zu `jetzt`, auf volle Viertelstunde gerundet (lesbare Zeiten). */
export function relativ(jetzt: Date, stunden: number): Date {
  const viertel = 15 * 60_000;
  return new Date(Math.round((jetzt.getTime() + stunden * STUNDE) / viertel) * viertel);
}
