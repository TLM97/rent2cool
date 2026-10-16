/**
 * Miete-Statusmodell (D-009). Entspricht docs/datenmodell.md §5.2.
 * Buchungsregeln (D-006/D-010/R-22) werden im Kern beim Anlegen/Bestätigen
 * geprüft; hier nur die erlaubten Statusübergänge.
 */
export const MIETE_STATUS = [
  'angefragt',
  'bestaetigt',
  'aktiv',
  'beendet',
  'abgerechnet',
  'storniert',
] as const;
export type MieteStatus = (typeof MIETE_STATUS)[number];

const UEBERGAENGE: Record<MieteStatus, readonly MieteStatus[]> = {
  angefragt: ['bestaetigt', 'storniert'],
  bestaetigt: ['aktiv', 'storniert'],
  aktiv: ['beendet'],
  beendet: ['abgerechnet'],
  abgerechnet: [],
  storniert: [],
};

export function istMieteStatus(wert: string): wert is MieteStatus {
  return (MIETE_STATUS as readonly string[]).includes(wert);
}
export function istMieteUebergangErlaubt(von: MieteStatus, nach: MieteStatus): boolean {
  return UEBERGAENGE[von].includes(nach);
}
