/**
 * Kern-API-Zugriff des Portals (nur serverseitig). Das Portal hat keine
 * Datenbank und kein Dienstkonto: Jede Anfrage trägt das Token des
 * angemeldeten Kunden, Rechte und Sichtbarkeit setzt der Kern durch (D-020).
 * Bei abgelaufener Anmeldung (401) geht es zurück zur Anmeldung.
 */
import { redirect } from 'next/navigation';
import {
  ApiFehler,
  erstelleApiClient,
  type Abfrage,
  type ApiClient,
} from '@rent2cool/oberflaeche/api-client';
import { holeSitzung } from './sitzung';
import type { Ich } from './typen';

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

export async function apiDelete<T>(pfad: string): Promise<T> {
  try {
    return await client().entferne<T>(pfad);
  } catch (e) {
    beiNichtAngemeldet(e);
  }
}

/** Wie apiGet, liefert aber `null` bei 403/404. */
export async function apiGetOderNull<T>(pfad: string, abfrage?: Abfrage): Promise<T | null> {
  try {
    return await apiGet<T>(pfad, abfrage);
  } catch (e) {
    if (e instanceof ApiFehler && (e.status === 403 || e.status === 404)) return null;
    throw e;
  }
}

/** Wer bin ich? Rollen und Kunde kommen aus dem Kern (`kunde_konto`). */
export function holeIch(): Promise<Ich> {
  return apiGet<Ich>('/v1/ich');
}

/** Für Seiten, die einen Kunden voraussetzen: ohne Kunde zur Registrierung. */
export async function mitKunde(): Promise<Ich & { kunde: NonNullable<Ich['kunde']> }> {
  const ich = await holeIch();
  if (!ich.kunde) redirect('/portal/registrierung');
  return ich as Ich & { kunde: NonNullable<Ich['kunde']> };
}
