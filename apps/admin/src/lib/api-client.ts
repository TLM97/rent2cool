/**
 * Schlanker Client für die Kern-API. Rein und injizierbar (Token-Quelle,
 * fetch), damit er ohne Next.js und ohne laufenden Kern testbar ist. Die
 * Oberfläche spricht ausschließlich über diese Schnittstelle mit dem Kern –
 * Rollen und Audit Trail setzt der Kern durch (T-004).
 */
export class ApiFehler extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiFehler';
  }
}

export type Abfrage = Record<string, string | number | boolean | null | undefined>;

export function baueUrl(basis: string, pfad: string, abfrage?: Abfrage): string {
  const url = new URL(pfad.replace(/^\/+/, ''), basis.endsWith('/') ? basis : `${basis}/`);
  for (const [schluessel, wert] of Object.entries(abfrage ?? {})) {
    if (wert !== undefined && wert !== null && wert !== '') {
      url.searchParams.set(schluessel, String(wert));
    }
  }
  return url.toString();
}

function alsJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Liest eine lesbare Fehlermeldung aus der Nest-Fehlerantwort. */
export function meldungAus(daten: unknown): string | undefined {
  if (typeof daten === 'string' && daten) return daten;
  if (typeof daten !== 'object' || daten === null) return undefined;
  const d = daten as Record<string, unknown>;
  const m = d.message;
  if (typeof m === 'string') return m;
  if (Array.isArray(m)) return m.join('; ');
  if (typeof m === 'object' && m !== null) {
    const mm = m as Record<string, unknown>;
    const gruende = Array.isArray(mm.gruende) ? `: ${mm.gruende.join('; ')}` : '';
    if (typeof mm.fehler === 'string') return `${mm.fehler}${gruende}`;
  }
  if (Array.isArray(d.gruende)) return d.gruende.join('; ');
  if (typeof d.fehler === 'string') return d.fehler;
  return undefined;
}

export interface ApiClientOptionen {
  basisUrl: string;
  token: () => Promise<string | undefined>;
  fetcher?: typeof fetch;
}

export interface ApiClient {
  get<T>(pfad: string, abfrage?: Abfrage): Promise<T>;
  post<T>(pfad: string, body?: unknown): Promise<T>;
}

export function erstelleApiClient(optionen: ApiClientOptionen): ApiClient {
  const f = optionen.fetcher ?? fetch;

  async function anfrage<T>(methode: 'GET' | 'POST', pfad: string, abfrage?: Abfrage, body?: unknown): Promise<T> {
    const token = await optionen.token();
    if (!token) {
      throw new ApiFehler(401, 'Nicht angemeldet');
    }
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    const res = await f(baueUrl(optionen.basisUrl, pfad, abfrage), {
      method: methode,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const text = await res.text();
    const daten = text ? alsJson(text) : undefined;
    if (!res.ok) {
      throw new ApiFehler(res.status, meldungAus(daten) ?? `HTTP ${res.status}`, daten);
    }
    return daten as T;
  }

  return {
    get: <T>(pfad: string, abfrage?: Abfrage) => anfrage<T>('GET', pfad, abfrage),
    post: <T>(pfad: string, body?: unknown) => anfrage<T>('POST', pfad, undefined, body ?? {}),
  };
}
