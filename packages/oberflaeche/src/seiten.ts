/** Hilfen für Seitenparameter (Next liefert string | string[] | undefined). */
export type SuchParameter = Record<string, string | string[] | undefined>;

export function erster(wert: string | string[] | undefined): string | undefined {
  return Array.isArray(wert) ? wert[0] : wert;
}

export interface Blatt {
  seite: number;
  limit: number;
  offset: number;
}

/** 1-basierte Seite aus `?seite=` – ungültige Werte werden zu Seite 1. */
export function blattAus(params: SuchParameter, limit = 25): Blatt {
  const roh = Number(erster(params.seite));
  const seite = Number.isInteger(roh) && roh > 0 ? roh : 1;
  return { seite, limit, offset: (seite - 1) * limit };
}

/** Baut einen Link auf eine andere Seite und behält die übrigen Filter. */
export function seitenLink(pfad: string, params: SuchParameter, seite: number): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const w = erster(v);
    if (w && k !== 'seite' && k !== 'fehler' && k !== 'erfolg') q.set(k, w);
  }
  if (seite > 1) q.set('seite', String(seite));
  const s = q.toString();
  return s ? `${pfad}?${s}` : pfad;
}

/** Nur echte UUIDs in Pfade der Kern-API einsetzen. */
export function istUuid(wert: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wert);
}

/**
 * Link auf `pfad` mit den aktuellen Parametern, einzelne geändert
 * (`undefined` oder leer entfernt). Seite und Meldungen werden nicht übernommen.
 */
export function linkMit(
  pfad: string,
  params: SuchParameter,
  aenderungen: Record<string, string | undefined>,
): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const w = erster(v);
    if (w && k !== 'seite' && k !== 'fehler' && k !== 'erfolg') q.set(k, w);
  }
  for (const [k, w] of Object.entries(aenderungen)) {
    if (w) q.set(k, w);
    else q.delete(k);
  }
  const s = q.toString();
  return s ? `${pfad}?${s}` : pfad;
}
