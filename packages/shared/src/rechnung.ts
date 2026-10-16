/**
 * Rechnungs-Statusmodell und Betragslogik (R-63). Beträge in ganzen Cent, um
 * Fließkomma-Fehler zu vermeiden. Umsatzsteuer: Kurzzeitvermietung mit Übergabe
 * in Deutschland wird in Deutschland besteuert (D-006); der Satz ist
 * konfigurierbar und vom Steuerberater zu bestätigen (R-63).
 */
export const RECHNUNG_STATUS = ['entwurf', 'gestellt', 'bezahlt', 'storniert'] as const;
export type RechnungStatus = (typeof RECHNUNG_STATUS)[number];

const UEBERGAENGE: Record<RechnungStatus, readonly RechnungStatus[]> = {
  entwurf: ['gestellt', 'storniert'],
  gestellt: ['bezahlt', 'storniert'],
  bezahlt: [],
  storniert: [],
};

export function istRechnungStatus(wert: string): wert is RechnungStatus {
  return (RECHNUNG_STATUS as readonly string[]).includes(wert);
}
export function istRechnungUebergangErlaubt(von: RechnungStatus, nach: RechnungStatus): boolean {
  return UEBERGAENGE[von].includes(nach);
}

export interface Betraege {
  readonly nettoCent: number;
  readonly steuerSatzProzent: number;
  readonly steuerCent: number;
  readonly bruttoCent: number;
}

/** Berechnet Steuer- und Bruttobetrag (kaufmännisch gerundet) aus Netto + Satz. */
export function rechneBetraege(nettoCent: number, steuerSatzProzent: number): Betraege {
  const steuerCent = Math.round((nettoCent * steuerSatzProzent) / 100);
  return {
    nettoCent,
    steuerSatzProzent,
    steuerCent,
    bruttoCent: nettoCent + steuerCent,
  };
}

/** Rechnungsnummer-Format: JAHR-00001 (fortlaufend je Mandant und Jahr). */
export function formatRechnungsnummer(jahr: number, laufendeNummer: number): string {
  return `${jahr}-${String(laufendeNummer).padStart(5, '0')}`;
}
