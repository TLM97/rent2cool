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

/** Bezug des Nachweises zur Miete – lesbare Angaben für Kunde und Auditor. */
export interface NachweisMieteBezug {
  readonly mieteId: string;
  readonly kunde: string;
  readonly kennzeichen: string;
  readonly startIst: string;
  readonly endeIst: string;
}

/** Punkt der Temperaturkurve (für die Grafik verdichtet: Minimum und Maximum je Abschnitt). */
export interface KurvenPunkt {
  readonly zeit: string;
  readonly wert: number;
}

/**
 * Das archivierte Dokument einer Miete (JSON und PDF aus denselben Daten).
 * `nachweis.integritaet` sichert die Messdaten; die Dateien selbst sichert das
 * Archiv mit SHA-256 und einer Dokumentsignatur.
 */
export interface NachweisDokument {
  readonly schemaVersion: 1;
  readonly titel: string;
  readonly version: number;
  readonly ausloeser: NachweisAusloeser;
  /** `null` beim Nachweis über Fahrzeug und Zeitraum ohne Miete. */
  readonly miete: NachweisMieteBezug | null;
  readonly nachweis: TemperaturNachweis;
  readonly kurve: readonly KurvenPunkt[];
  /** Elektronisches Siegel des PDF (F-47); `null` = ungesiegelt. */
  readonly siegel: NachweisSiegel | null;
}

export interface NachweisSiegel {
  /** `testsiegel` = Platzhalter ohne Rechtswirkung (D-015). */
  readonly art: 'testsiegel' | 'zertifikat' | 'qualifiziert';
  readonly aussteller: string;
}

export type NachweisAusloeser = 'automatisch' | 'manuell';

/**
 * Kurve für die Grafik verdichten: je Abschnitt Minimum und Maximum behalten,
 * damit kurze Grenzverletzungen sichtbar bleiben (nicht wegmitteln, GDP).
 */
export function verdichteKurve(punkte: readonly KurvenPunkt[], abschnitte = 400): KurvenPunkt[] {
  if (punkte.length <= abschnitte * 2) return [...punkte];
  const ergebnis: KurvenPunkt[] = [];
  const groesse = punkte.length / abschnitte;
  for (let i = 0; i < abschnitte; i++) {
    const teil = punkte.slice(Math.floor(i * groesse), Math.floor((i + 1) * groesse));
    if (teil.length === 0) continue;
    let min = teil[0]!;
    let max = teil[0]!;
    for (const p of teil) {
      if (p.wert < min.wert) min = p;
      if (p.wert > max.wert) max = p;
    }
    // Zeitliche Reihenfolge innerhalb des Abschnitts wahren.
    if (min === max) ergebnis.push(min);
    else ergebnis.push(...(min.zeit <= max.zeit ? [min, max] : [max, min]));
  }
  return ergebnis;
}
