import type {
  BefehlStatus,
  ChecklistenAntwort,
  FotoPerspektive,
  FotoStatus,
  ProtokollArt,
  ProtokollStatus,
  Schaden,
  FahrzeugBefehl,
  Oeffnungsregeln,
  Position,
  UebergabePruefung,
} from '@rent2cool/shared';

/**
 * Antwortformen der Kern-API, wie die Oberfläche sie nutzt (JSON: Zeitpunkte
 * als ISO-Strings). Bewusst schmal – nur die angezeigten Felder.
 */
export interface Liste<T> {
  eintraege: T[];
  gesamt: number;
  limit: number;
  offset: number;
}

export interface Fahrzeug {
  id: string;
  kennzeichen: string;
  vin: string | null;
  fahrzeugprofil: string;
  zulGesamtmasseKg: number;
  benoetigteFuehrerscheinklasse: string;
  hatFahrtenschreiber: boolean;
  standardTemperaturprofil: string | null;
  standortId: string | null;
  status: string;
  erstelltAm: string;
  aktualisiertAm: string;
  /** Nur in Listen (Join im Kern). */
  standortName?: string | null;
}

export interface Sensor {
  id: string;
  messgroesse: string;
  einheit: string;
  modell: string | null;
  seriennummer: string | null;
  aktiv: boolean;
  eingebautAm: string;
  ausgebautAm: string | null;
  ausbauGrund: string | null;
  vorgaengerId: string | null;
  /** Jüngstes „gültig bis“ aller Kalibrierungen. */
  kalibriertBis: string | null;
}

export interface Aggregat {
  id: string;
  typ: string | null;
  hersteller: string | null;
  seriennummer: string | null;
  sensoren: Sensor[];
}

export interface FahrzeugAkte {
  fahrzeug: Fahrzeug;
  aggregate: Aggregat[];
}

export interface Pruefergebnis {
  buchbar?: boolean;
  einsatzbereit?: boolean;
  gruende: string[];
}

export interface Kunde {
  id: string;
  firmenname: string;
  ustId: string | null;
  handelsregisternummer: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string;
  status: string;
  erstelltAm: string;
  aktualisiertAm: string;
}

export interface Fahrer {
  id: string;
  kundeId: string;
  name: string;
  fuehrerscheinKlasse: string;
  fuehrerscheinNummer: string | null;
  fuehrerscheinGueltigBis: string | null;
  status: string;
  /** Login-Konto für die App (digitaler Schlüssel). */
  kontoId?: string | null;
  aktualisiertAm: string;
}

export interface Miete {
  id: string;
  kundeId: string;
  fahrzeugId: string;
  fahrerId: string | null;
  standortAbholId: string | null;
  standortRueckgabeId: string | null;
  /** Übergabebereich-Prüfung bei Übergabe (→ aktiv) und Rückgabe (→ beendet). */
  uebergabePruefung?: UebergabePruefung | null;
  rueckgabePruefung?: UebergabePruefung | null;
  startGeplant: string;
  endeGeplant: string;
  startIst: string | null;
  endeIst: string | null;
  auslandsfahrtGeplant: boolean;
  temperaturprofil: string | null;
  status: string;
  /** Nur in Listen (Join im Kern). */
  fahrzeugKennzeichen?: string;
  kundeFirmenname?: string;
}

export interface Rechnung {
  id: string;
  rechnungsnummer: string;
  kundeId: string;
  mieteId: string;
  zeitraumVon: string;
  zeitraumBis: string;
  nettoCent: number;
  steuerSatz: number;
  steuerCent: number;
  bruttoCent: number;
  waehrung: string;
  status: string;
  gestelltAm: string | null;
  bezahltAm: string | null;
  erstelltAm: string;
  /** Nur in Listen (Join im Kern). */
  kundeFirmenname?: string;
}

export interface Alarm {
  id: string;
  fahrzeugId: string;
  mieteId: string | null;
  typ: string;
  wert: number | null;
  schwelle: number | null;
  ausgeloestAm: string;
  status: string;
  quittiertVon: string | null;
  /** Nur in Listen (Join im Kern). */
  fahrzeugKennzeichen?: string;
}

export interface Abweichung {
  id: string;
  bezugTyp: string;
  bezugId: string;
  beschreibung: string;
  schweregrad: string | null;
  status: string;
  bewertung: string | null;
  massnahmen: string | null;
  verantwortlich: string | null;
  erfasstAm: string;
  geschlossenAm: string | null;
  /** Kennzeichen des betroffenen Fahrzeugs (über Miete/Alarm aufgelöst). */
  bezugKennzeichen?: string | null;
}

export interface FaelligeKalibrierung {
  fahrzeugId: string;
  kennzeichen: string;
  sensorId: string;
  seriennummer: string | null;
  gueltigBis: string | null;
}

export interface FaelligerFuehrerschein {
  fahrerId: string;
  name: string;
  kundeId: string;
  gueltigBis: string | null;
}

/** Treffer der Fahrzeugsuche für eine Buchung (buchbar im Zeitraum). */
export interface VerfuegbaresFahrzeug {
  id: string;
  kennzeichen: string;
  benoetigteFuehrerscheinklasse: string;
  hatFahrtenschreiber: boolean;
  standardTemperaturprofil: string | null;
  zulGesamtmasseKg: number;
  /** Frühestes Ablaufdatum der Kalibrierungen aller aktiven Sensoren. */
  kalibriertBis: string;
}

/** Standort (D-011). */
export interface Standort {
  id: string;
  name: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string;
  region: string | null;
  geofenceLat: number | null;
  geofenceLng: number | null;
  geofenceRadiusM: number | null;
  oeffnungsregeln: Oeffnungsregeln | null;
  aktiv: boolean;
  erstelltAm: string;
  aktualisiertAm: string;
  /** Nur in der Liste. */
  fahrzeugAnzahl?: number;
}

/** Antwort von GET /v1/fahrzeuge/:id/position. */
export interface FahrzeugPosition {
  position: Position | null;
  pruefung: UebergabePruefung;
}

/** Digitaler Schlüssel (GET /v1/mieten/:id/schluessel). */
export interface Schluessel {
  id: string;
  mieteId: string;
  fahrerId: string;
  fahrerName: string;
  appKontoVerknuepft: boolean;
  status: 'aktiv' | 'widerrufen';
  gueltigVon: string;
  gueltigBis: string | null;
  ausgestelltVon: string;
  widerrufenAm: string | null;
  widerrufGrund: string | null;
  erstelltAm: string;
}

/** Befehl an ein Fahrzeug (Protokoll, auch abgelehnte). */
export interface Befehl {
  id: string;
  fahrzeugId: string;
  mieteId: string | null;
  schluesselId: string | null;
  befehl: FahrzeugBefehl;
  status: BefehlStatus;
  gruende: string[] | null;
  grund: string | null;
  angefordertVon: string;
  angefordertAm: string;
  abgeschlossenAm: string | null;
  /** Fahrer, falls mit dessen Schlüssel gesendet. */
  fahrerName: string | null;
}

/** Foto im Übergabeprotokoll (`url` nur bei hochgeladenen, kurzlebig). */
export interface ProtokollFoto {
  id: string;
  perspektive: FotoPerspektive;
  status: FotoStatus;
  contentType: string;
  groesse: number;
  verwurfGrund: string | null;
  angefordertAm: string;
  hochgeladenAm: string | null;
  url: string | null;
}

/** Übergabe-/Rückgabeprotokoll (GET /v1/mieten/:id/protokolle). */
export interface Protokoll {
  id: string;
  mieteId: string;
  art: ProtokollArt;
  status: ProtokollStatus;
  kmStand: number | null;
  checkliste: Record<string, ChecklistenAntwort> | null;
  schaeden: Schaden[] | null;
  erstelltVon: string;
  erstelltAm: string;
  abgeschlossenAm: string | null;
  version: string;
  fotos: ProtokollFoto[];
  fehlt: string[];
}

/** Archivierter Temperaturnachweis (GET /v1/mieten/:id/temperaturnachweise). */
export interface NachweisArchivEintrag {
  id: string;
  mieteId: string;
  version: number;
  ausloeser: 'automatisch' | 'manuell';
  erzeugtAm: string;
  bewertung: string;
  anzahlGrenzverletzungen: number;
  anzahlLuecken: number;
  jsonSha256: string;
  pdfSha256: string;
  pdfGroesse: number;
  jsonUrl: string;
  pdfUrl: string;
}
