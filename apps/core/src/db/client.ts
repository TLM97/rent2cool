/**
 * Drizzle-Datenbankzugriff (D-001). Schemaänderungen laufen ausschließlich
 * über versionierte SQL-Migrationen im Repo (nachvollziehbar für die
 * Validierung, R-10). Hier nur die Verbindung; Tabellen kommen mit dem
 * freigegebenen Datenmodell (T-002).
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

export function createDbClient(databaseUrl: string) {
  // max=10: kleiner Pool je zustandsloser Instanz; skaliert über die Anzahl
  // der Instanzen, nicht über einen riesigen Pool (D-003).
  const sql = postgres(databaseUrl, { max: 10 });
  const db = drizzle(sql);
  return { sql, db };
}

export type Database = ReturnType<typeof createDbClient>['db'];
