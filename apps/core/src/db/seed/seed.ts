/**
 * Seed der lokalen Entwicklungsdatenbank mit Platzhalter-Stammdaten (D-015).
 * Aufruf:  pnpm --filter @rent2cool/core db:seed
 *
 * Legt den Platzhalter-Mandanten und den Standort PLACEHOLDER_HQ an
 * (idempotent). Ausschließlich erfundene Testdaten – keine echten Personen-
 * oder Kundendaten, solange `dpo` ein Platzhalter ist (D-015-Regel).
 */
import { createDbClient } from '../client';
import { mandant, standort } from '../schema';
import {
  PLACEHOLDER_HQ_ID,
  PLACEHOLDER_MANDANT_ID,
  placeholderDpo,
  placeholderHq,
} from './placeholder-data';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const hq = placeholderHq();
  const dpo = placeholderDpo();

  console.log('Platzhalter-Stammdaten (D-015):');
  console.log(JSON.stringify({ mandantId: PLACEHOLDER_MANDANT_ID, standort: hq, dpo }, null, 2));

  if (!databaseUrl) {
    console.log('\nDATABASE_URL nicht gesetzt – überspringe das Schreiben in die DB.');
    return;
  }

  const { db, sql } = createDbClient(databaseUrl);
  try {
    await db
      .insert(mandant)
      .values({ id: PLACEHOLDER_MANDANT_ID, name: 'Rent2Cool (Platzhalter-Mandant)' })
      .onConflictDoNothing();
    await db
      .insert(standort)
      .values({
        id: PLACEHOLDER_HQ_ID,
        mandantId: PLACEHOLDER_MANDANT_ID,
        name: hq.name,
        strasse: hq.strasse,
        plz: hq.plz,
        ort: hq.ort,
        land: hq.land,
        geofenceLat: hq.geofence.center.lat,
        geofenceLng: hq.geofence.center.lng,
        geofenceRadiusM: hq.geofence.radiusM,
      })
      .onConflictDoNothing();
    console.log('\nMandant und Standort PLACEHOLDER_HQ angelegt (idempotent).');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
