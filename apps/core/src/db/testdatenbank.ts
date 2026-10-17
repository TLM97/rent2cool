/**
 * Eigene Datenbank für Integrationstests, getrennt von Entwicklungs- und
 * Demo-Daten. Vorrang: TEST_DATABASE_URL, sonst DATABASE_URL mit Suffix
 * `_test` am Datenbanknamen, sonst die lokale Standard-Datenbank.
 * Sicherung: Der Name muss auf `_test` enden – Tests laufen nie gegen eine
 * Arbeitsdatenbank.
 */
const STANDARD = 'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool';

export function datenbankName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

export function testDatenbankUrl(env: Record<string, string | undefined> = process.env): string {
  let url: URL;
  if (env.TEST_DATABASE_URL) {
    url = new URL(env.TEST_DATABASE_URL);
  } else {
    url = new URL(env.DATABASE_URL ?? STANDARD);
    const name = datenbankName(url.toString());
    if (!name.endsWith('_test')) url.pathname = `/${name}_test`;
  }
  const name = datenbankName(url.toString());
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(
      `Test-Datenbank muss auf „_test“ enden und darf nur a–z, 0–9 und _ enthalten: „${name}“`,
    );
  }
  return url.toString();
}

/** Verbindung zur Verwaltungsdatenbank `postgres` desselben Servers (zum Anlegen). */
export function verwaltungsUrl(url: string): string {
  const u = new URL(url);
  u.pathname = '/postgres';
  return u.toString();
}
