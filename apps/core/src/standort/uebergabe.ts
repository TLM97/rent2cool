/**
 * Übergabebereich-Prüfung (D-011, D-014): letzte Telematik-Position eines
 * Fahrzeugs gegen den Geofence eines Standorts. Die Positionsabfrage ist
 * zeitlich begrenzt (D-003: nie unbegrenzt über alle Messwerte) und nutzt den
 * Index (fahrzeug_id, zeit DESC) der Hypertable.
 */
import { and, eq, sql } from 'drizzle-orm';
import { pruefeUebergabebereich, type Position, type UebergabePruefung } from '@rent2cool/shared';
import type { Database, Transaktion } from '../db/client';
import { standort } from '../db/schema';

/** Wie weit zurück nach der letzten Position gesucht wird. */
const SUCHFENSTER = '24 hours';

/** Letzte Position bis `bis` (Breite und Länge aus derselben Nachricht). */
export async function letztePosition(
  db: Database | Transaktion,
  fahrzeugId: string,
  bis: Date,
): Promise<Position | null> {
  const bisIso = bis.toISOString();
  const zeilen = (await db.execute(sql`
    select breite.zeit, breite.wert as lat, laenge.wert as lng
    from messwert breite
    join messwert laenge
      on laenge.fahrzeug_id = breite.fahrzeug_id
     and laenge.zeit = breite.zeit
     and laenge.nachricht_id = breite.nachricht_id
     and laenge.messgroesse = 'position_lng'
    where breite.fahrzeug_id = ${fahrzeugId}
      and breite.messgroesse = 'position_lat'
      and breite.zeit <= ${bisIso}::timestamptz
      and breite.zeit > ${bisIso}::timestamptz - ${SUCHFENSTER}::interval
    order by breite.zeit desc
    limit 1
  `)) as unknown as { zeit: string | Date; lat: number; lng: number }[];
  const z = zeilen[0];
  return z
    ? { lat: Number(z.lat), lng: Number(z.lng), zeit: new Date(z.zeit).toISOString() }
    : null;
}

/** Prüft, ob das Fahrzeug zum Zeitpunkt im Übergabebereich des Standorts steht. */
export async function pruefeUebergabe(
  db: Database | Transaktion,
  mandant: string,
  fahrzeugId: string,
  standortId: string | null,
  zeitpunkt: Date,
): Promise<UebergabePruefung> {
  const [s] = standortId
    ? await db
        .select({
          lat: standort.geofenceLat,
          lng: standort.geofenceLng,
          radiusM: standort.geofenceRadiusM,
        })
        .from(standort)
        .where(and(eq(standort.id, standortId), eq(standort.mandantId, mandant)))
    : [];
  const geofence =
    s && s.lat !== null && s.lng !== null && s.radiusM !== null
      ? { lat: s.lat, lng: s.lng, radiusM: s.radiusM }
      : null;
  return pruefeUebergabebereich({
    standortId: s ? standortId : null,
    geofence,
    position: await letztePosition(db, fahrzeugId, zeitpunkt),
    zeitpunkt,
  });
}
