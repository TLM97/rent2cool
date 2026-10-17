/**
 * Reine Helfer für Formulare: Feldwerte lesen, Ortszeit (Europa/Berlin) in UTC
 * umrechnen, Validierungsfehler den Feldern zuordnen. Gespeichert wird in UTC
 * (CLAUDE.md), eingegeben wird in deutscher Ortszeit.
 */

/** Zustand eines Formulars zwischen zwei Absendungen (useActionState). */
export interface FormularZustand {
  /** Meldung oberhalb des Formulars. */
  fehler?: string;
  /** Aufzählung unter der Meldung, z. B. Ablehnungsgründe einer Buchung. */
  liste?: string[];
  /** Fehlertexte je Feldname. */
  feldFehler?: Record<string, string>;
  /** Zuletzt eingegebene Werte, damit bei Fehlern nichts verloren geht. */
  werte?: Record<string, string>;
}

/** Alle Textfelder eines Formulars (ohne interne Next.js-Felder). */
export function werteAus(fd: FormData): Record<string, string> {
  const werte: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === 'string' && !k.startsWith('$')) {
      werte[k] = v;
    }
  }
  return werte;
}

/** Getrimmter Text; leer wird zu `undefined`. */
export function text(fd: FormData, name: string): string | undefined {
  const v = fd.get(name);
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

export function haken(fd: FormData, name: string): boolean {
  const v = fd.get(name);
  return v === 'on' || v === 'true';
}

/** Dezimalzahl; akzeptiert deutsches Komma. Leer/ungültig bleibt Text, damit die Validierung meldet. */
export function betrag(fd: FormData, name: string): string | number | undefined {
  const t = text(fd, name);
  if (t === undefined) return undefined;
  // „1.234,50“ (deutsch) → 1234.50; „119.5“ bleibt.
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : t;
}

const ZEITZONE = 'Europe/Berlin';
const teileFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: ZEITZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Versatz (ms) der Berliner Ortszeit zu UTC zum Zeitpunkt `ms`. */
function versatz(ms: number): number {
  const t: Record<string, number> = {};
  for (const p of teileFmt.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') t[p.type] = Number(p.value);
  }
  const alsUtc = Date.UTC(t.year!, t.month! - 1, t.day!, t.hour!, t.minute!, t.second!);
  return alsUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * „2026-10-17T10:00“ (Berliner Ortszeit, wie aus datetime-local) → UTC-ISO.
 * Ein reines Datum „2026-10-17“ gilt als 00:00 Uhr. Ungültig → `undefined`.
 */
export function berlinLokalZuIso(lokal: string | undefined): string | undefined {
  if (!lokal) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(lokal);
  if (!m) return undefined;
  const [, j, mo, d, h = '00', mi = '00'] = m;
  const wand = Date.UTC(Number(j), Number(mo) - 1, Number(d), Number(h), Number(mi));
  // Zweimal annähern, damit Sommer-/Winterzeitwechsel korrekt sind.
  let utc = wand - versatz(wand);
  utc = wand - versatz(utc);
  const datum = new Date(utc);
  return Number.isNaN(datum.getTime()) ? undefined : datum.toISOString();
}

/** Datum „2026-10-17“ → Ende dieses Tages (23:59 Berliner Zeit) in UTC. */
export function berlinTagesendeZuIso(datum: string | undefined): string | undefined {
  return datum && /^\d{4}-\d{2}-\d{2}$/.test(datum)
    ? berlinLokalZuIso(`${datum}T23:59`)
    : undefined;
}

/** UTC-ISO → Wert für `datetime-local` (bzw. `date`) in Berliner Ortszeit. */
export function isoZuBerlinLokal(iso: string | Date, nurDatum = false): string {
  const ms = new Date(iso).getTime();
  const lokal = new Date(ms + versatz(ms)).toISOString();
  return nurDatum ? lokal.slice(0, 10) : lokal.slice(0, 16);
}

interface ValidierungsFehler {
  issues: { path: (string | number)[]; message: string }[];
}

/** Erste Meldung je Feld (Pfad „a.b.0“ → Schlüssel „a.b.0“). */
export function feldFehlerAus(fehler: ValidierungsFehler): Record<string, string> {
  const ergebnis: Record<string, string> = {};
  for (const i of fehler.issues) {
    const schluessel = i.path.join('.') || '_';
    ergebnis[schluessel] ??= i.message;
  }
  return ergebnis;
}

/** Erlaubte Folgestatus aus der Liste aller Status. */
export function naechsteStatus<S extends string>(
  alle: readonly S[],
  von: string,
  erlaubt: (von: S, nach: S) => boolean,
): S[] {
  if (!(alle as readonly string[]).includes(von)) return [];
  return alle.filter((s) => s !== von && erlaubt(von as S, s));
}
