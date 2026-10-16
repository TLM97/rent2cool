import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle-Kit-Konfiguration (D-001). Migrationen liegen als versioniertes SQL
 * in ./drizzle. `schema` zeigt auf die (noch leeren) Schema-Dateien; sobald
 * das Datenmodell freigegeben ist (T-002), wächst dieser Pfad.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/*.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/rent2cool',
  },
  verbose: true,
  strict: true,
});
