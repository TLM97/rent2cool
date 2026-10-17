/**
 * Führt alle ausstehenden SQL-Migrationen aus ./drizzle aus.
 * Aufruf:  pnpm --filter @rent2cool/core db:migrate
 *
 * Idempotent: Drizzle merkt sich angewandte Migrationen in einer eigenen
 * Tabelle und überspringt bereits ausgeführte.
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

/** Alle ausstehenden Migrationen auf `databaseUrl` anwenden (auch für die Test-Datenbank). */
export async function migriere(databaseUrl: string): Promise<void> {
  // max=1 für Migrationen: eine Verbindung, keine Parallelität.
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: `${__dirname}/../../drizzle` });
  } finally {
    await sql.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL ist nicht gesetzt.');
  }
  await migriere(databaseUrl);
  console.log('Migrationen angewandt.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
