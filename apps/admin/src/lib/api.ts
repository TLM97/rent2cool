/**
 * Kern-API-Zugriff für Server Components und Server Actions. Bei abgelaufener
 * oder fehlender Anmeldung (401) geht es zurück zur Anmeldung.
 */
import { redirect } from 'next/navigation';
import { ApiFehler, erstelleApiClient, type Abfrage, type ApiClient } from './api-client';
import { holeSitzung } from './sitzung';

function client(): ApiClient {
  return erstelleApiClient({
    basisUrl: process.env.CORE_API_URL ?? 'http://localhost:3000',
    token: async () => (await holeSitzung())?.accessToken,
  });
}

function beiNichtAngemeldet(e: unknown): never {
  if (e instanceof ApiFehler && e.status === 401) {
    redirect('/anmelden?grund=abgelaufen');
  }
  throw e;
}

export async function apiGet<T>(pfad: string, abfrage?: Abfrage): Promise<T> {
  try {
    return await client().get<T>(pfad, abfrage);
  } catch (e) {
    beiNichtAngemeldet(e);
  }
}

export async function apiPost<T>(pfad: string, body?: unknown): Promise<T> {
  try {
    return await client().post<T>(pfad, body);
  } catch (e) {
    beiNichtAngemeldet(e);
  }
}

export async function apiPatch<T>(pfad: string, body: unknown): Promise<T> {
  try {
    return await client().patch<T>(pfad, body);
  } catch (e) {
    beiNichtAngemeldet(e);
  }
}

/** Wie apiGet, liefert aber `null` bei fehlender Berechtigung (403) oder 404. */
export async function apiGetOderNull<T>(pfad: string, abfrage?: Abfrage): Promise<T | null> {
  try {
    return await apiGet<T>(pfad, abfrage);
  } catch (e) {
    if (e instanceof ApiFehler && (e.status === 403 || e.status === 404)) {
      return null;
    }
    throw e;
  }
}
