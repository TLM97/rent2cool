/**
 * Digitaler Schlüssel und Fernzugriff (D-014, kritischer Pfad der Roadmap).
 *
 * Der Kern ist die Instanz, die entscheidet: Jeder Befehl an ein Fahrzeug
 * (Entriegeln, Verriegeln, Wegfahrsperre) läuft über den Kern, wird gegen
 * Schlüssel und Miete geprüft und protokolliert – auch abgelehnte Versuche.
 * Die Ausführung übernimmt ein austauschbarer `KeyProvider` (D-015: Simulator,
 * bis Mercedes-Lösung oder Nachrüstung entschieden ist).
 */
import { z } from 'zod';

export const FAHRZEUG_BEFEHLE = [
  'entriegeln',
  'verriegeln',
  'wegfahrsperre_ein',
  'wegfahrsperre_aus',
] as const;
export type FahrzeugBefehl = (typeof FAHRZEUG_BEFEHLE)[number];

export const BEFEHL_NAME: Record<FahrzeugBefehl, string> = {
  entriegeln: 'Entriegeln',
  verriegeln: 'Verriegeln',
  wegfahrsperre_ein: 'Wegfahrsperre ein',
  wegfahrsperre_aus: 'Wegfahrsperre aus',
};

/** Befehle, die der Fahrer mit seinem Schlüssel senden darf. Die Wegfahrsperre steuert nur Ops. */
export const FAHRER_BEFEHLE: readonly FahrzeugBefehl[] = ['entriegeln', 'verriegeln'];

/**
 * - `gesendet`: an den Anbieter übergeben, Bestätigung steht aus
 * - `ausgefuehrt` / `fehlgeschlagen`: Rückmeldung des Anbieters
 * - `abgelehnt`: vom Kern abgelehnt (Gründe gespeichert), nie gesendet
 */
export const BEFEHL_STATUS = ['gesendet', 'ausgefuehrt', 'fehlgeschlagen', 'abgelehnt'] as const;
export type BefehlStatus = (typeof BEFEHL_STATUS)[number];

export const SCHLUESSEL_STATUS = ['aktiv', 'widerrufen'] as const;
export type SchluesselStatus = (typeof SCHLUESSEL_STATUS)[number];

/** Der Schlüssel gilt ab so vielen Minuten vor dem geplanten Mietbeginn. */
export const SCHLUESSEL_VORLAUF_MIN = 60;

/** Mietstatus, in denen ein Schlüssel ausgestellt und benutzt werden darf. */
const MIETE_MIT_SCHLUESSEL = ['bestaetigt', 'aktiv'];

/** Beginn der Gültigkeit eines Schlüssels zur Miete. */
export function schluesselGueltigAb(startGeplant: Date): Date {
  return new Date(startGeplant.getTime() - SCHLUESSEL_VORLAUF_MIN * 60_000);
}

/** Darf zu einer Miete in diesem Status ein Schlüssel ausgestellt werden? */
export function schluesselAusstellbar(mieteStatus: string): string[] {
  return MIETE_MIT_SCHLUESSEL.includes(mieteStatus)
    ? []
    : [`Miete ist nicht bestätigt oder aktiv (Status ${mieteStatus})`];
}

export interface SchluesselPruefdaten {
  status: string;
  gueltigVon: Date;
  /** `null`: bis zum Ende der Miete (dann automatisch widerrufen). */
  gueltigBis: Date | null;
}

/**
 * Prüft einen Befehl mit dem Schlüssel eines Fahrers. Leere Liste = erlaubt.
 * Alle Gründe werden gesammelt, damit Protokoll und Anzeige vollständig sind.
 */
export function pruefeSchluesselBefehl(o: {
  schluessel: SchluesselPruefdaten;
  mieteStatus: string;
  befehl: FahrzeugBefehl;
  jetzt: Date;
}): string[] {
  const gruende: string[] = [];
  if (!FAHRER_BEFEHLE.includes(o.befehl)) {
    gruende.push(`${BEFEHL_NAME[o.befehl]} ist mit dem Fahrerschlüssel nicht erlaubt`);
  }
  if (o.schluessel.status !== 'aktiv') {
    gruende.push('Schlüssel ist widerrufen');
  }
  if (o.jetzt.getTime() < o.schluessel.gueltigVon.getTime()) {
    gruende.push(`Schlüssel gilt erst ab ${o.schluessel.gueltigVon.toISOString()}`);
  }
  if (o.schluessel.gueltigBis && o.jetzt.getTime() > o.schluessel.gueltigBis.getTime()) {
    gruende.push('Schlüssel ist abgelaufen');
  }
  gruende.push(...schluesselAusstellbar(o.mieteStatus));
  return gruende;
}

// --- Eingaben ---
const idempotencyKey = z.string().trim().min(1).max(200);

export const schluesselAusstellenSchema = z.object({
  fahrerId: z.string().uuid('Fahrer auswählen'),
});
export type SchluesselAusstellen = z.infer<typeof schluesselAusstellenSchema>;

export const schluesselWiderrufenSchema = z.object({
  grund: z.string().trim().min(1, 'Grund fehlt').max(500),
});

/** Befehl mit dem Fahrerschlüssel (App). Wiederholungen bei schlechtem Netz: gleicher Key. */
export const schluesselBefehlSchema = z.object({
  befehl: z.enum(FAHRZEUG_BEFEHLE),
  idempotencyKey,
});
export type SchluesselBefehl = z.infer<typeof schluesselBefehlSchema>;

/** Befehl durch Ops/Admin direkt ans Fahrzeug – immer mit Grund (Audit). */
export const fahrzeugBefehlSchema = z.object({
  befehl: z.enum(FAHRZEUG_BEFEHLE),
  grund: z.string().trim().min(1, 'Grund fehlt').max(500),
  idempotencyKey,
});
export type FahrzeugBefehlEingabe = z.infer<typeof fahrzeugBefehlSchema>;
