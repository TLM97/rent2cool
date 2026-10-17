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
}

export interface Sensor {
  id: string;
  messgroesse: string;
  einheit: string;
  modell: string | null;
  seriennummer: string | null;
  aktiv: boolean;
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
  ort: string | null;
  status: string;
  erstelltAm: string;
}

export interface Fahrer {
  id: string;
  name: string;
  fuehrerscheinKlasse: string;
  fuehrerscheinGueltigBis: string | null;
  status: string;
}

export interface Miete {
  id: string;
  kundeId: string;
  fahrzeugId: string;
  fahrerId: string | null;
  startGeplant: string;
  endeGeplant: string;
  startIst: string | null;
  endeIst: string | null;
  auslandsfahrtGeplant: boolean;
  temperaturprofil: string | null;
  status: string;
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
}

export interface FaelligeKalibrierung {
  fahrzeugId: string;
  kennzeichen: string;
  sensorId: string;
  gueltigBis: string | null;
}

export interface FaelligerFuehrerschein {
  fahrerId: string;
  name: string;
  kundeId: string;
  gueltigBis: string | null;
}
