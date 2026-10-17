/**
 * Reine Helfer der Buchung im Portal (ohne Next.js testbar). Eingegeben wird
 * in deutscher Ortszeit, an den Kern geht UTC (CLAUDE.md). Die Buchungsregeln
 * selbst prüft ausschließlich der Kern.
 */
import { berlinLokalZuIso, isoZuBerlinLokal } from '@rent2cool/oberflaeche/formular';
import { erster, type SuchParameter } from '@rent2cool/oberflaeche/seiten';

const STUNDE = 3_600_000;

export interface Zeitraum {
  /** Ortszeit wie im Feld `datetime-local`. */
  start: string;
  ende: string;
  vonIso?: string;
  bisIso?: string;
  /** Gültig: beide gesetzt, Ende nach Start. */
  ok: boolean;
}

/** Zeitraum aus der Suche; ohne Angabe ab der nächsten vollen Stunde für 24 Stunden. */
export function zeitraumAus(params: SuchParameter, jetzt = Date.now()): Zeitraum {
  const naechste = Math.ceil(jetzt / STUNDE) * STUNDE;
  const start = erster(params.start) ?? isoZuBerlinLokal(new Date(naechste));
  const ende = erster(params.ende) ?? isoZuBerlinLokal(new Date(naechste + 24 * STUNDE));
  const vonIso = berlinLokalZuIso(start);
  const bisIso = berlinLokalZuIso(ende);
  const ok = Boolean(vonIso && bisIso && new Date(bisIso).getTime() > new Date(vonIso).getTime());
  return { start, ende, vonIso, bisIso, ok };
}

/** Stornieren kann der Kunde nur, solange die Miete nicht begonnen hat. */
export function kannStornieren(status: string): boolean {
  return status === 'angefragt' || status === 'bestaetigt';
}
