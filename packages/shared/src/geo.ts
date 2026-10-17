/**
 * Übergabebereich (D-011, D-014): Liegt die letzte Telematik-Position eines
 * Fahrzeugs im Geofence des Standorts? Reine Funktionen – Kern und Oberflächen
 * rechnen gleich.
 */

export interface GeoPunkt {
  lat: number;
  lng: number;
}

export interface Geofence extends GeoPunkt {
  radiusM: number;
}

export interface Position extends GeoPunkt {
  /** Zeitpunkt der Messung (UTC, ISO-8601). */
  zeit: string;
}

/** Positionen älter als das gelten als „unbekannt“ (Fahrzeug sendet nicht). */
export const POSITION_MAX_ALTER_MIN = 30;

const ERDRADIUS_M = 6_371_000;

/** Großkreis-Abstand in Metern (Haversine) – für Übergabebereiche bis 10 km genau genug. */
export function abstandMeter(a: GeoPunkt, b: GeoPunkt): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * ERDRADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type UebergabeErgebnis = 'im_bereich' | 'ausserhalb' | 'unbekannt';

export interface UebergabePruefung {
  ergebnis: UebergabeErgebnis;
  /** Bei „unbekannt“: warum. */
  grund?: string;
  standortId: string | null;
  /** Abstand zum Mittelpunkt des Geofence (gerundet). */
  abstandM?: number;
  radiusM?: number;
  position?: Position;
  /** Zeitpunkt, zu dem geprüft wurde (UTC). */
  geprueftAm: string;
}

/**
 * Prüft eine Position gegen den Geofence eines Standorts zum Zeitpunkt
 * `zeitpunkt`. Ohne Standort, ohne Geofence, ohne oder mit veralteter
 * Position ist das Ergebnis „unbekannt“ – nie stillschweigend „im Bereich“.
 */
export function pruefeUebergabebereich(o: {
  standortId: string | null;
  geofence: Geofence | null;
  position: Position | null;
  zeitpunkt: Date;
  maxAlterMin?: number;
}): UebergabePruefung {
  const basis = { standortId: o.standortId, geprueftAm: o.zeitpunkt.toISOString() };
  if (!o.standortId) return { ...basis, ergebnis: 'unbekannt', grund: 'Kein Standort festgelegt' };
  if (!o.geofence) return { ...basis, ergebnis: 'unbekannt', grund: 'Standort ohne Geofence' };
  if (!o.position) return { ...basis, ergebnis: 'unbekannt', grund: 'Keine Position empfangen' };
  const alterMin = (o.zeitpunkt.getTime() - new Date(o.position.zeit).getTime()) / 60_000;
  if (alterMin > (o.maxAlterMin ?? POSITION_MAX_ALTER_MIN)) {
    return {
      ...basis,
      ergebnis: 'unbekannt',
      grund: `Letzte Position ist ${Math.round(alterMin)} Min. alt`,
      position: o.position,
    };
  }
  const abstandM = Math.round(abstandMeter(o.position, o.geofence));
  return {
    ...basis,
    ergebnis: abstandM <= o.geofence.radiusM ? 'im_bereich' : 'ausserhalb',
    abstandM,
    radiusM: o.geofence.radiusM,
    position: o.position,
  };
}

/** Lesbarer Abstand: „35 m“, „2,4 km“. */
export function abstandText(meter: number): string {
  return meter < 1000
    ? `${Math.round(meter)} m`
    : `${(meter / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`;
}
