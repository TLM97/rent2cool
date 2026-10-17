/**
 * Audit-Einträge lesbar machen: was ist passiert, welche Felder haben sich wie
 * geändert. Beschriftungen und Formate liegen hier an einer Stelle.
 */
import {
  oeffnungszeitenText,
  type Oeffnungsregeln,
  type UebergabePruefung,
} from '@rent2cool/shared';
import { formatDatumZeit, formatEuro, statusLabel } from './format';
import { uebergabeText } from './uebergabe';

export interface AuditEintrag {
  id: string;
  zeit: string;
  akteurId: string;
  akteurName: string | null;
  akteurRolle: string | null;
  aktion: string;
  entitaetTyp: string;
  entitaetId: string | null;
  altWert: unknown;
  neuWert: unknown;
}

export interface Feldaenderung {
  feld: string;
  /** `null` beim Anlegen: es gab keinen alten Wert. */
  alt: string | null;
  neu: string;
}

const FELDER: Record<string, string> = {
  status: 'Status',
  startIst: 'Start (tatsächlich)',
  endeIst: 'Ende (tatsächlich)',
  gestelltAm: 'gestellt am',
  bezahltAm: 'bezahlt am',
  geschlossenAm: 'geschlossen am',
  letztePruefungAm: 'letzte Prüfung',
  quittiertVon: 'quittiert von',
  quittiertAm: 'quittiert am',
  bewertung: 'Bewertung',
  massnahmen: 'Maßnahmen',
  verantwortlich: 'verantwortlich',
  firmenname: 'Firmenname',
  handelsregisternummer: 'Handelsregister',
  ustId: 'USt-ID',
  strasse: 'Straße',
  plz: 'PLZ',
  ort: 'Ort',
  land: 'Land',
  kennzeichen: 'Kennzeichen',
  vin: 'VIN',
  zulGesamtmasseKg: 'zul. Gesamtmasse (kg)',
  benoetigteFuehrerscheinklasse: 'Führerscheinklasse',
  hatFahrtenschreiber: 'Fahrtenschreiber',
  standardTemperaturprofil: 'Temperaturprofil',
  name: 'Name',
  fuehrerscheinKlasse: 'Führerscheinklasse',
  fuehrerscheinNummer: 'Führerscheinnummer',
  fuehrerscheinGueltigBis: 'Führerschein gültig bis',
  startGeplant: 'Start (geplant)',
  endeGeplant: 'Ende (geplant)',
  auslandsfahrtGeplant: 'Auslandsfahrt',
  temperaturprofil: 'Temperaturprofil',
  rechnungsnummer: 'Rechnungsnummer',
  nettoCent: 'Netto',
  steuerSatz: 'USt-Satz (%)',
  bruttoCent: 'Brutto',
  beschreibung: 'Beschreibung',
  schweregrad: 'Schweregrad',
  bezugTyp: 'Bezug',
  durchgefuehrtAm: 'geprüft am',
  gueltigBis: 'gültig bis',
  pruefstelle: 'Prüfstelle',
  zertifikatRef: 'Zertifikat',
  ergebnis: 'Ergebnis',
  seriennummer: 'Seriennummer',
  modell: 'Modell',
  grund: 'Grund',
  aktiv: 'aktiv',
  geofenceLat: 'Geofence Breite',
  geofenceLng: 'Geofence Länge',
  geofenceRadiusM: 'Geofence-Radius (m)',
  oeffnungsregeln: 'Öffnungszeiten',
  standortId: 'Heimatstandort (ID)',
  region: 'Region',
  uebergabePruefung: 'Übergabebereich (Übergabe)',
  rueckgabePruefung: 'Übergabebereich (Rückgabe)',
};

const ISO_ZEIT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function istObjekt(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function formatWert(feld: string, wert: unknown): string {
  // Öffnungszeiten: null bedeutet „rund um die Uhr“, nicht „leer“.
  if (feld === 'oeffnungsregeln') {
    return (
      oeffnungszeitenText(wert as Oeffnungsregeln | null)
        .filter((z) => !z.endsWith('geschlossen'))
        .join('; ') || 'überall geschlossen'
    );
  }
  if (
    (feld === 'uebergabePruefung' || feld === 'rueckgabePruefung') &&
    wert &&
    typeof wert === 'object'
  ) {
    return uebergabeText(wert as UebergabePruefung).text;
  }
  if (wert === null || wert === undefined || wert === '') return '–';
  if (feld === 'status' && typeof wert === 'string') return statusLabel(wert);
  if (typeof wert === 'boolean') return wert ? 'ja' : 'nein';
  if (typeof wert === 'number')
    return feld.endsWith('Cent') ? formatEuro(wert) : wert.toLocaleString('de-DE');
  if (typeof wert === 'string') return ISO_ZEIT.test(wert) ? formatDatumZeit(wert) : wert;
  return JSON.stringify(wert);
}

/** Geänderte Felder (alt → neu); unveränderte Felder werden weggelassen. */
export function feldaenderungen(alt: unknown, neu: unknown): Feldaenderung[] {
  const a = istObjekt(alt) ? alt : {};
  const n = istObjekt(neu) ? neu : {};
  const felder = [...new Set([...Object.keys(a), ...Object.keys(n)])];
  return felder
    .filter((f) => JSON.stringify(a[f] ?? null) !== JSON.stringify(n[f] ?? null))
    .map((f) => ({ feld: FELDER[f] ?? f, alt: formatWert(f, a[f]), neu: formatWert(f, n[f]) }));
}

/**
 * Beim Anlegen: die beschrifteten, gefüllten Felder des neuen Datensatzes
 * (technische Felder wie IDs bleiben weg).
 */
export function angelegteFelder(neu: unknown): Feldaenderung[] {
  if (!istObjekt(neu)) return [];
  return Object.keys(FELDER)
    .filter((f) => neu[f] !== null && neu[f] !== undefined && neu[f] !== '')
    .map((f) => ({ feld: FELDER[f]!, alt: null, neu: formatWert(f, neu[f]) }));
}

/** Kurzbeschreibung des Vorgangs. */
export function vorgang(e: AuditEintrag): string {
  if (e.entitaetTyp === 'kalibrierung') return 'Kalibrierung erfasst';
  if (e.entitaetTyp === 'alarm_quittieren') return 'Alarm quittiert';
  if (e.entitaetTyp === 'alarm_schliessen') return 'Alarm geschlossen';
  if (e.entitaetTyp === 'sensor_tausch') return 'Sensor getauscht';
  if (e.aktion === 'PATCH') return 'Stammdaten geändert';
  if (e.entitaetTyp.endsWith('_status')) {
    const alt = istObjekt(e.altWert) ? e.altWert.status : undefined;
    const neu = istObjekt(e.neuWert) ? e.neuWert.status : undefined;
    return alt !== undefined && alt === neu ? 'Angaben ergänzt' : 'Status geändert';
  }
  if (e.aktion === 'POST') return 'angelegt';
  return e.aktion;
}

/** Wer: lesbarer Name, sonst gekürzte Kennung. */
export function akteur(e: AuditEintrag): string {
  return e.akteurName ?? `Konto ${e.akteurId.slice(0, 8)}`;
}

export function beschreibe(e: AuditEintrag): {
  vorgang: string;
  wer: string;
  aenderungen: Feldaenderung[];
} {
  const v = vorgang(e);
  const neuAngelegt = v === 'angelegt' || v === 'Kalibrierung erfasst';
  return {
    vorgang: v,
    wer: akteur(e),
    // Anlegen: Felder des neuen Datensatzes. Ältere Einträge (vor 2026-10-17)
    // enthalten nur die ID – dann bleibt die Liste leer.
    aenderungen: neuAngelegt ? angelegteFelder(e.neuWert) : feldaenderungen(e.altWert, e.neuWert),
  };
}
