/**
 * Kunden- und Fahrer-Statusmodelle sowie die Fahrerlaubnis-Prüfung (R-22,
 * D-004/D-010). Entspricht docs/datenmodell.md §5.3/§5.4.
 *
 * Wichtig (D-004): Fahrer gehören zum Kunden, nicht zu Rent2Cool. Die Prüfung
 * der Fahrerlaubnis jedes Fahrers ist Kernfunktion: Identität, Klasse gegen
 * Fahrzeuggewicht, wiederkehrende Prüfung, Sperre bei Ablauf.
 */

// --- Kunde ---
export const KUNDE_STATUS = [
  'angelegt',
  'in_pruefung',
  'freigegeben',
  'gesperrt',
  'abgelehnt',
  'archiviert',
] as const;
export type KundeStatus = (typeof KUNDE_STATUS)[number];

const KUNDE_UEBERGAENGE: Record<KundeStatus, readonly KundeStatus[]> = {
  angelegt: ['in_pruefung'],
  in_pruefung: ['freigegeben', 'abgelehnt'],
  freigegeben: ['gesperrt', 'archiviert'],
  gesperrt: ['freigegeben', 'archiviert'],
  abgelehnt: [],
  archiviert: [],
};

export function istKundeStatus(wert: string): wert is KundeStatus {
  return (KUNDE_STATUS as readonly string[]).includes(wert);
}
export function istKundeUebergangErlaubt(von: KundeStatus, nach: KundeStatus): boolean {
  return KUNDE_UEBERGAENGE[von].includes(nach);
}

// --- Fahrer ---
export const FAHRER_STATUS = [
  'angelegt',
  'identitaet_pruefung',
  'freigegeben',
  'gesperrt',
  'abgelehnt',
  'archiviert',
] as const;
export type FahrerStatus = (typeof FAHRER_STATUS)[number];

const FAHRER_UEBERGAENGE: Record<FahrerStatus, readonly FahrerStatus[]> = {
  angelegt: ['identitaet_pruefung'],
  identitaet_pruefung: ['freigegeben', 'abgelehnt'],
  freigegeben: ['gesperrt', 'archiviert'],
  gesperrt: ['freigegeben', 'archiviert'],
  abgelehnt: [],
  archiviert: [],
};

export function istFahrerStatus(wert: string): wert is FahrerStatus {
  return (FAHRER_STATUS as readonly string[]).includes(wert);
}
export function istFahrerUebergangErlaubt(von: FahrerStatus, nach: FahrerStatus): boolean {
  return FAHRER_UEBERGAENGE[von].includes(nach);
}

// --- Führerscheinklassen-Abdeckung ---
// Welche benötigte Klasse deckt eine gehaltene Klasse ab (vereinfacht; die
// genaue Zuordnung ist von der Planung zu bestätigen, F-19).
const DECKT: Record<string, readonly string[]> = {
  B: ['B'],
  BE: ['B', 'BE'],
  C1: ['B', 'C1'],
  C1E: ['B', 'C1', 'C1E'],
  C: ['B', 'C1', 'C'],
  CE: ['B', 'C1', 'C', 'CE'],
};

export function klasseDeckt(gehalten: string, benoetigt: string): boolean {
  return (DECKT[gehalten] ?? [gehalten]).includes(benoetigt);
}

export interface FahrerPruefdaten {
  readonly status: string;
  readonly fuehrerscheinKlasse: string;
  readonly fuehrerscheinGueltigBis: Date | null;
}

export interface EinsatzErgebnis {
  readonly einsatzbereit: boolean;
  readonly gruende: string[];
}

/**
 * Darf der Fahrer ein Fahrzeug der geforderten Klasse zum Stichtag fahren?
 * freigegeben + Führerschein gültig + Klasse deckt die geforderte Klasse (R-22).
 */
export function bewerteFahrerEinsatz(
  fahrer: FahrerPruefdaten,
  benoetigteKlasse: string,
  stichtag: Date,
): EinsatzErgebnis {
  const gruende: string[] = [];
  if (fahrer.status !== 'freigegeben') {
    gruende.push(`Status ist "${fahrer.status}", nicht "freigegeben"`);
  }
  if (!fahrer.fuehrerscheinGueltigBis) {
    gruende.push('Kein Führerschein-Ablaufdatum hinterlegt');
  } else if (fahrer.fuehrerscheinGueltigBis.getTime() < stichtag.getTime()) {
    gruende.push(`Führerschein abgelaufen am ${fahrer.fuehrerscheinGueltigBis.toISOString()}`);
  }
  if (!klasseDeckt(fahrer.fuehrerscheinKlasse, benoetigteKlasse)) {
    gruende.push(
      `Klasse "${fahrer.fuehrerscheinKlasse}" deckt benötigte Klasse "${benoetigteKlasse}" nicht`,
    );
  }
  return { einsatzbereit: gruende.length === 0, gruende };
}
