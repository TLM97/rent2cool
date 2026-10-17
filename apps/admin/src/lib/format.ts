/**
 * Anzeige-Formatierung. Gespeichert wird in UTC (CLAUDE.md); angezeigt wird in
 * deutscher Ortszeit, damit Ops-Team und QA mit lokalen Uhrzeiten arbeiten.
 */
const ZEITZONE = 'Europe/Berlin';

const datumZeitFmt = new Intl.DateTimeFormat('de-DE', {
  timeZone: ZEITZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});
const datumFmt = new Intl.DateTimeFormat('de-DE', { timeZone: ZEITZONE, dateStyle: 'medium' });

function alsDatum(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDatumZeit(iso: string | null | undefined): string {
  const d = alsDatum(iso);
  return d ? datumZeitFmt.format(d) : '–';
}

export function formatDatum(iso: string | null | undefined): string {
  const d = alsDatum(iso);
  return d ? datumFmt.format(d) : '–';
}

export function formatEuro(cent: number | null | undefined, waehrung = 'EUR'): string {
  if (cent === null || cent === undefined) return '–';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: waehrung }).format(
    cent / 100,
  );
}

export function formatTemperatur(c: number | null | undefined): string {
  if (c === null || c === undefined) return '–';
  return `${c.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C`;
}

/** Erste 8 Zeichen einer UUID – zur kompakten Anzeige. */
export function kurzeId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : '–';
}

export type Ton = 'ok' | 'info' | 'warn' | 'kritisch' | 'neutral';

const TON: Record<string, Ton> = {
  // Fahrzeug
  verfuegbar: 'ok',
  reserviert: 'info',
  vermietet: 'info',
  in_ruecknahme: 'info',
  reinigung_pruefung: 'warn',
  wartung: 'warn',
  ausser_betrieb: 'kritisch',
  stillgelegt: 'neutral',
  // Kunde/Fahrer
  in_pruefung: 'warn',
  identitaet_pruefung: 'warn',
  freigegeben: 'ok',
  gesperrt: 'kritisch',
  abgelehnt: 'kritisch',
  archiviert: 'neutral',
  // Miete
  angefragt: 'neutral',
  bestaetigt: 'info',
  aktiv: 'info',
  beendet: 'neutral',
  abgerechnet: 'ok',
  storniert: 'neutral',
  // Rechnung
  entwurf: 'neutral',
  gestellt: 'info',
  bezahlt: 'ok',
  // Alarm
  offen: 'kritisch',
  quittiert: 'warn',
  geschlossen: 'neutral',
  // Abweichung
  erfasst: 'warn',
  in_bewertung: 'warn',
  bewertet: 'warn',
  massnahmen_offen: 'warn',
  verworfen: 'neutral',
  // Nachweis
  eingehalten: 'ok',
  verletzt: 'kritisch',
  unvollstaendig: 'warn',
  // Schlüssel und Fahrzeugbefehle
  widerrufen: 'neutral',
  gesendet: 'info',
  ausgefuehrt: 'ok',
  fehlgeschlagen: 'kritisch',
  // Übergabeprotokoll und Fotos
  abgeschlossen: 'ok',
  angefordert: 'neutral',
  hochgeladen: 'ok',
};

export function statusTon(status: string): Ton {
  return TON[status] ?? 'neutral';
}

const LABEL: Record<string, string> = {
  angelegt: 'angelegt',
  verfuegbar: 'verfügbar',
  reserviert: 'reserviert',
  vermietet: 'vermietet',
  in_ruecknahme: 'in Rücknahme',
  reinigung_pruefung: 'Reinigung/Prüfung',
  wartung: 'Wartung',
  ausser_betrieb: 'außer Betrieb',
  stillgelegt: 'stillgelegt',
  in_pruefung: 'in Prüfung',
  identitaet_pruefung: 'Identitätsprüfung',
  freigegeben: 'freigegeben',
  gesperrt: 'gesperrt',
  abgelehnt: 'abgelehnt',
  archiviert: 'archiviert',
  angefragt: 'angefragt',
  bestaetigt: 'bestätigt',
  aktiv: 'aktiv',
  beendet: 'beendet',
  abgerechnet: 'abgerechnet',
  storniert: 'storniert',
  entwurf: 'Entwurf',
  gestellt: 'gestellt',
  bezahlt: 'bezahlt',
  offen: 'offen',
  quittiert: 'quittiert',
  geschlossen: 'geschlossen',
  erfasst: 'erfasst',
  in_bewertung: 'in Bewertung',
  bewertet: 'bewertet',
  massnahmen_offen: 'Maßnahmen offen',
  verworfen: 'verworfen',
  eingehalten: 'eingehalten',
  verletzt: 'verletzt',
  unvollstaendig: 'unvollständig',
  widerrufen: 'widerrufen',
  gesendet: 'gesendet',
  ausgefuehrt: 'ausgeführt',
  fehlgeschlagen: 'fehlgeschlagen',
  abgeschlossen: 'abgeschlossen',
  angefordert: 'nicht hochgeladen',
  hochgeladen: 'hochgeladen',
  // Alarmtypen
  temperatur_ueber: 'Temperatur zu hoch',
  temperatur_unter: 'Temperatur zu niedrig',
  tuer_offen: 'Tür offen',
  funkloch: 'Funkloch',
  grenzuebertritt_ohne_tacho: 'Grenzübertritt ohne Fahrtenschreiber',
  kalibrierung_abgelaufen: 'Kalibrierung abgelaufen',
};

export function statusLabel(status: string): string {
  return LABEL[status] ?? status.replace(/_/g, ' ');
}
