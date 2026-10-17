/**
 * Vorbereitung der Integrationstests (nur mit RUN_INTEGRATION=1): eigene
 * Test-Datenbank anlegen, falls nötig, und migrieren. Die Tests selbst
 * bekommen ihre DATABASE_URL über vitest.config.ts.
 */
import postgres from 'postgres';
import { migriere } from './src/db/migrate';
import { datenbankName, testDatenbankUrl, verwaltungsUrl } from './src/db/testdatenbank';

/**
 * Wartet, bis die Datenbank Verbindungen annimmt. Ein frisch gestarteter
 * Postgres-Container startet nach der Initialisierung einmal neu – direkt
 * danach scheitern Verbindungen kurz (lokal und in der CI).
 */
async function warteAufDatenbank(url: string, versuche = 30): Promise<void> {
  for (let i = 1; ; i++) {
    const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 5 });
    try {
      await sql`select 1`;
      return;
    } catch (e) {
      if (i >= versuche) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    } finally {
      await sql.end({ timeout: 1 });
    }
  }
}

export default async function vorbereiten(): Promise<void> {
  if (process.env.RUN_INTEGRATION !== '1') return;
  const url = testDatenbankUrl();
  const name = datenbankName(url); // geprüft: nur [a-z0-9_], endet auf _test
  await warteAufDatenbank(verwaltungsUrl(url));
  const verwaltung = postgres(verwaltungsUrl(url), { max: 1, onnotice: () => {} });
  try {
    const [vorhanden] = await verwaltung`select 1 from pg_database where datname = ${name}`;
    if (!vorhanden) {
      await verwaltung.unsafe(`create database "${name}"`);
    }
  } finally {
    await verwaltung.end();
  }
  await migriere(url);
}
