/**
 * Herstellerneutrales Telematik-Format (D-012: Adapter je Quelle) und die
 * signierte Transporthülle für den Telematik-Eingang (T-003).
 *
 * Grundsätze (D-003/CLAUDE.md):
 *  - Jede Nachricht bringt ihre eigene eindeutige `nachrichtId` mit. Der
 *    Eingang vergibt KEINE IDs; die ID dient der Duplikaterkennung.
 *  - Alle Zeitstempel in UTC (ISO-8601).
 *  - Messwerte sind unveränderbar (nur Anhängen im Kern).
 *
 * Die Signatur ist eine echte HMAC-SHA256 über die exakt übertragene
 * Payload-Zeichenkette. Der Schlüssel ist bis zur Anbieterwahl ein
 * Platzhalter (D-015: „Signatur“ als Schnittstelle mit Platzhalter-Schlüssel).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/** Eine einzelne Messgröße einer Nachricht (ca. 10 je Nachricht, D-003). */
export const telemetrieWertSchema = z.object({
  /** z. B. temperatur_laderaum, temperatur_aussen, position_lat, position_lng,
   *  kilometerstand, geschwindigkeit, tuer_offen, wegfahrsperre, batterie. */
  messgroesse: z.string().min(1),
  wert: z.number().finite(),
  /** Einheit: C, grad, km, kmh, bool, v, … */
  einheit: z.string().min(1),
  /** Optionaler eigener Zeitpunkt des Werts; sonst gilt `gesendetAm`. */
  zeit: z.string().datetime({ offset: true }).optional(),
});
export type TelemetrieWert = z.infer<typeof telemetrieWertSchema>;

/** Die neutrale Telematik-Nachricht (Ergebnis eines Adapters). */
export const telemetrieNachrichtSchema = z.object({
  /** Eindeutige ID der Nachricht – von der Quelle vergeben (Duplikaterkennung). */
  nachrichtId: z.string().min(8).max(128),
  /** Fahrzeug, von dem die Nachricht stammt (UUID). */
  fahrzeugId: z.string().uuid(),
  /** Adapter-/Quellkennung, z. B. "simulator". */
  quelle: z.string().min(1),
  /** Zeitpunkt des Versands durch die Box (UTC, ISO-8601). */
  gesendetAm: z.string().datetime({ offset: true }),
  /** Messwerte der Nachricht. */
  messwerte: z.array(telemetrieWertSchema).min(1).max(100),
});
export type TelemetrieNachricht = z.infer<typeof telemetrieNachrichtSchema>;

/** Signierte Transporthülle, wie sie über HTTP an den Eingang geht. */
export const signierteHuelleSchema = z.object({
  /** Exakte JSON-Zeichenkette der `TelemetrieNachricht`, über die signiert wurde. */
  payload: z.string().min(1),
  alg: z.literal('HMAC-SHA256'),
  /** Hex-kodierte HMAC-SHA256 über `payload`. */
  signatur: z.string().regex(/^[0-9a-f]+$/i),
});
export type SignierteHuelle = z.infer<typeof signierteHuelleSchema>;

/** Berechnet die HMAC-SHA256 (hex) über die Payload-Zeichenkette. */
export function signiere(payload: string, schluessel: string): string {
  return createHmac('sha256', schluessel).update(payload, 'utf8').digest('hex');
}

/** Baut eine signierte Hülle aus einer Nachricht. */
export function baueHuelle(
  nachricht: TelemetrieNachricht,
  schluessel: string,
): SignierteHuelle {
  const payload = JSON.stringify(nachricht);
  return { payload, alg: 'HMAC-SHA256', signatur: signiere(payload, schluessel) };
}

/** Prüft die Signatur einer Hülle in konstanter Zeit. */
export function pruefeSignatur(huelle: SignierteHuelle, schluessel: string): boolean {
  const erwartet = signiere(huelle.payload, schluessel);
  const a = Buffer.from(erwartet, 'hex');
  const b = Buffer.from(huelle.signatur, 'hex');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export type HuellenPruefung =
  | { ok: true; nachricht: TelemetrieNachricht }
  | { ok: false; grund: 'format' | 'signatur' | 'payload'; detail: string };

/**
 * Validiert Format UND Signatur einer eingehenden Hülle und gibt die
 * geparste Nachricht zurück. Reine Funktion – ohne Netzwerk, gut testbar.
 */
export function validierePayloadUndSignatur(
  roh: unknown,
  schluessel: string,
): HuellenPruefung {
  const huelle = signierteHuelleSchema.safeParse(roh);
  if (!huelle.success) {
    return { ok: false, grund: 'format', detail: huelle.error.message };
  }
  if (!pruefeSignatur(huelle.data, schluessel)) {
    return { ok: false, grund: 'signatur', detail: 'HMAC stimmt nicht' };
  }
  let roheNachricht: unknown;
  try {
    roheNachricht = JSON.parse(huelle.data.payload);
  } catch {
    return { ok: false, grund: 'payload', detail: 'payload ist kein JSON' };
  }
  const nachricht = telemetrieNachrichtSchema.safeParse(roheNachricht);
  if (!nachricht.success) {
    return { ok: false, grund: 'payload', detail: nachricht.error.message };
  }
  return { ok: true, nachricht: nachricht.data };
}

/**
 * Adapter: wandelt ein quellspezifisches Rohformat in die neutrale Nachricht
 * um (D-012). Der Simulator ist der erste Adapter und liefert bereits das
 * neutrale Format.
 */
export interface TelemetrieAdapter<TRoh = unknown> {
  readonly quelle: string;
  zuNeutral(roh: TRoh): TelemetrieNachricht;
}
