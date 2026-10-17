/**
 * Audit-Einträge lesbar machen: was ist passiert, welche Felder haben sich wie
 * geändert. Beschriftungen und Formate liegen hier an einer Stelle.
 */
import { formatDatumZeit, statusLabel } from './format';

export interface AuditEintrag {
  id: string;
  zeit: string;
  akteurId: string;
  akteurName: string | null;
  akteurRolle: string | null;
  aktion: string;
  entitaetTyp: string;
  altWert: unknown;
  neuWert: unknown;
}

export interface Feldaenderung {
  feld: string;
  alt: string;
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
};

const ISO_ZEIT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function istObjekt(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function formatWert(feld: string, wert: unknown): string {
  if (wert === null || wert === undefined || wert === '') return '–';
  if (feld === 'status' && typeof wert === 'string') return statusLabel(wert);
  if (typeof wert === 'boolean') return wert ? 'ja' : 'nein';
  if (typeof wert === 'number') return wert.toLocaleString('de-DE');
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

/** Kurzbeschreibung des Vorgangs. */
export function vorgang(e: AuditEintrag): string {
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

export function beschreibe(e: AuditEintrag): { vorgang: string; wer: string; aenderungen: Feldaenderung[] } {
  // Beim Anlegen (Rückfallebene) steht im neuen Wert nur die Antwort – keine Feldliste zeigen.
  const angelegt = vorgang(e) === 'angelegt';
  return { vorgang: vorgang(e), wer: akteur(e), aenderungen: angelegt ? [] : feldaenderungen(e.altWert, e.neuWert) };
}
