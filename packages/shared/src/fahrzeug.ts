/**
 * Fahrzeug-Statusmodell (Fahrzeugakte). Entspricht dem Zustandsdiagramm aus
 * dem Datenmodell-Vorschlag (docs/datenmodell.md §5.1). Die erlaubten Übergänge
 * liegen hier zentral, damit Kern und spätere Oberflächen dieselbe Wahrheit
 * nutzen.
 */
export const FAHRZEUG_STATUS = [
  'angelegt',
  'verfuegbar',
  'reserviert',
  'vermietet',
  'in_ruecknahme',
  'reinigung_pruefung',
  'wartung',
  'ausser_betrieb',
  'stillgelegt',
] as const;

export type FahrzeugStatus = (typeof FAHRZEUG_STATUS)[number];

const UEBERGAENGE: Record<FahrzeugStatus, readonly FahrzeugStatus[]> = {
  angelegt: ['verfuegbar', 'ausser_betrieb'],
  verfuegbar: ['reserviert', 'wartung', 'ausser_betrieb'],
  reserviert: ['vermietet', 'verfuegbar'],
  vermietet: ['in_ruecknahme'],
  in_ruecknahme: ['reinigung_pruefung'],
  reinigung_pruefung: ['verfuegbar', 'wartung'],
  wartung: ['verfuegbar', 'ausser_betrieb'],
  ausser_betrieb: ['verfuegbar', 'stillgelegt'],
  stillgelegt: [],
};

export function istFahrzeugStatus(wert: string): wert is FahrzeugStatus {
  return (FAHRZEUG_STATUS as readonly string[]).includes(wert);
}

export function erlaubteUebergaenge(von: FahrzeugStatus): readonly FahrzeugStatus[] {
  return UEBERGAENGE[von];
}

export function istUebergangErlaubt(von: FahrzeugStatus, nach: FahrzeugStatus): boolean {
  return UEBERGAENGE[von].includes(nach);
}
