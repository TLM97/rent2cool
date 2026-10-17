/**
 * Alarme und GDP-Abweichungen (CAPA). Statusmodelle wie docs/datenmodell.md
 * §5.5. Alarme entstehen aus der Telematik-Auswertung gegen das
 * Temperaturprofil (D-008); Abweichungen sind das Qualitätsverfahren, das von
 * der qualitätsverantwortlichen Person (`qa_approver`, D-015) bearbeitet wird.
 */
import type { Temperaturprofil } from './bericht';
import type { TelemetrieWert } from './telemetry';

// --- Alarm ---
export const ALARM_TYPEN = [
  'temperatur_ueber',
  'temperatur_unter',
  'tuer_offen',
  'funkloch',
  'grenzuebertritt_ohne_tacho',
  'kalibrierung_abgelaufen',
] as const;
export type AlarmTyp = (typeof ALARM_TYPEN)[number];

export const ALARM_STATUS = ['offen', 'quittiert', 'geschlossen'] as const;
export type AlarmStatus = (typeof ALARM_STATUS)[number];

const ALARM_UEBERGAENGE: Record<AlarmStatus, readonly AlarmStatus[]> = {
  offen: ['quittiert', 'geschlossen'],
  quittiert: ['geschlossen'],
  geschlossen: [],
};
export function istAlarmStatus(wert: string): wert is AlarmStatus {
  return (ALARM_STATUS as readonly string[]).includes(wert);
}
export function istAlarmUebergangErlaubt(von: AlarmStatus, nach: AlarmStatus): boolean {
  return ALARM_UEBERGAENGE[von].includes(nach);
}

// --- Abweichung (CAPA) ---
export const ABWEICHUNG_STATUS = [
  'erfasst',
  'in_bewertung',
  'bewertet',
  'massnahmen_offen',
  'geschlossen',
  'verworfen',
] as const;
export type AbweichungStatus = (typeof ABWEICHUNG_STATUS)[number];

const ABW_UEBERGAENGE: Record<AbweichungStatus, readonly AbweichungStatus[]> = {
  erfasst: ['in_bewertung', 'verworfen'],
  in_bewertung: ['bewertet', 'verworfen'],
  bewertet: ['massnahmen_offen', 'geschlossen'],
  massnahmen_offen: ['geschlossen'],
  geschlossen: [],
  verworfen: [],
};
export function istAbweichungStatus(wert: string): wert is AbweichungStatus {
  return (ABWEICHUNG_STATUS as readonly string[]).includes(wert);
}
export function istAbweichungUebergangErlaubt(
  von: AbweichungStatus,
  nach: AbweichungStatus,
): boolean {
  return ABW_UEBERGAENGE[von].includes(nach);
}

// --- Alarm-Auswertung (reine Funktion) ---
export interface AlarmKandidat {
  readonly typ: AlarmTyp;
  readonly messgroesse?: string;
  readonly wert?: number;
  readonly schwelle?: number;
}

/**
 * Prüft die Messwerte einer Nachricht gegen das Profil und liefert die
 * auslösenden Alarm-Kandidaten (Temperatur über/unter Grenze, Tür offen).
 */
export function findeAlarmKandidaten(
  messwerte: readonly TelemetrieWert[],
  profil: Temperaturprofil,
): AlarmKandidat[] {
  const kandidaten: AlarmKandidat[] = [];
  for (const m of messwerte) {
    if (m.messgroesse === 'temperatur_laderaum') {
      if (m.wert > profil.maxC) {
        kandidaten.push({
          typ: 'temperatur_ueber',
          messgroesse: m.messgroesse,
          wert: m.wert,
          schwelle: profil.maxC,
        });
      } else if (m.wert < profil.minC) {
        kandidaten.push({
          typ: 'temperatur_unter',
          messgroesse: m.messgroesse,
          wert: m.wert,
          schwelle: profil.minC,
        });
      }
    } else if (m.messgroesse === 'tuer_offen' && m.wert === 1) {
      kandidaten.push({ typ: 'tuer_offen', messgroesse: m.messgroesse, wert: m.wert });
    }
  }
  return kandidaten;
}
