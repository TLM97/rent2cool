/**
 * Datenverträge für den Temperaturnachweis (T-„Temperaturbericht v1").
 *
 * Bewusst als neutrale Typen in `shared`, damit später Portal/Admin denselben
 * Nachweis anzeigen können. Die Erzeugung (Logik, Signatur, Speicher) liegt im
 * Kern und ist über Interfaces austauschbar (Format, Speicher, Signatur).
 *
 * Hinweis: Dieser v1-Nachweis bezieht sich auf Fahrzeug + Zeitraum. Sobald die
 * Entität Miete freigegeben ist (Datenmodell T-002), wird er zusätzlich an eine
 * Miete gebunden (Miete liefert Fahrzeug + Zeitfenster).
 */

export interface Temperaturprofil {
  readonly name: string;
  readonly minC: number;
  readonly maxC: number;
}

/** Standard-Temperaturprofile (D-008), solange Profile aus der Konfiguration kommen (F-4). */
export const STANDARD_TEMPERATURPROFILE: readonly Temperaturprofil[] = [
  { name: '2-8', minC: 2, maxC: 8 },
  { name: '15-25', minC: 15, maxC: 25 },
];

export interface NachweisKennzahlen {
  readonly anzahl: number;
  readonly minC: number | null;
  readonly maxC: number | null;
  readonly mittelC: number | null;
  readonly ersteMessung: string | null;
  readonly letzteMessung: string | null;
}

export interface Grenzverletzung {
  readonly zeit: string;
  readonly wert: number;
  readonly art: 'unter' | 'ueber';
}

export interface Luecke {
  readonly von: string;
  readonly bis: string;
  readonly dauerMin: number;
}

/** Fälschungssicherheit: Hash über die Datenbasis + Signatur (R-10). */
export interface Integritaet {
  readonly algorithmus: string;
  readonly datenHash: string;
  readonly signatur: string;
}

export type NachweisBewertung = 'eingehalten' | 'verletzt' | 'unvollstaendig';

export interface TemperaturNachweis {
  readonly schemaVersion: 1;
  readonly fahrzeugId: string;
  readonly messgroesse: string;
  readonly von: string;
  readonly bis: string;
  readonly erzeugtAm: string;
  readonly profil: Temperaturprofil;
  readonly kennzahlen: NachweisKennzahlen;
  readonly grenzverletzungen: readonly Grenzverletzung[];
  readonly luecken: readonly Luecke[];
  readonly bewertung: NachweisBewertung;
  readonly integritaet: Integritaet;
}
