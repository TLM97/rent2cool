import { describe, expect, it } from 'vitest';
import { ApiFehler, baueUrl, erstelleApiClient, meldungAus } from './api-client';

describe('baueUrl', () => {
  it('setzt Pfad und Query, lässt leere Werte weg', () => {
    expect(
      baueUrl('http://localhost:3000', '/v1/fahrzeuge', { limit: 25, status: '', x: undefined }),
    ).toBe('http://localhost:3000/v1/fahrzeuge?limit=25');
  });
  it('behält einen Pfad-Präfix der Basis-URL', () => {
    expect(baueUrl('http://host/api', 'v1/mieten')).toBe('http://host/api/v1/mieten');
  });
});

describe('meldungAus', () => {
  it('liest Nest-Fehlertexte', () => {
    expect(meldungAus({ message: 'Fehlende Rolle' })).toBe('Fehlende Rolle');
    expect(meldungAus({ message: ['a', 'b'] })).toBe('a; b');
  });
  it('liest Buchungs-Ablehnungen mit Gründen', () => {
    expect(meldungAus({ message: { fehler: 'Buchung abgelehnt', gruende: ['x', 'y'] } })).toBe(
      'Buchung abgelehnt: x; y',
    );
  });
});

function fakeFetch(status: number, body: unknown, merke?: { url?: string; init?: RequestInit }) {
  return (async (url: string, init?: RequestInit) => {
    if (merke) {
      merke.url = url;
      merke.init = init;
    }
    return new Response(body === undefined ? '' : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

describe('erstelleApiClient', () => {
  it('sendet das Bearer-Token und liefert JSON', async () => {
    const merke: { url?: string; init?: RequestInit } = {};
    const client = erstelleApiClient({
      basisUrl: 'http://core',
      token: async () => 'abc',
      fetcher: fakeFetch(200, { gesamt: 3 }, merke),
    });
    const res = await client.get<{ gesamt: number }>('/v1/fahrzeuge', { limit: 1 });
    expect(res.gesamt).toBe(3);
    expect(merke.url).toBe('http://core/v1/fahrzeuge?limit=1');
    expect((merke.init?.headers as Record<string, string>).authorization).toBe('Bearer abc');
  });

  it('wirft ApiFehler mit Status und Meldung', async () => {
    const client = erstelleApiClient({
      basisUrl: 'http://core',
      token: async () => 'abc',
      fetcher: fakeFetch(403, { message: 'Fehlende Rolle' }),
    });
    await expect(client.post('/v1/alarme/x/quittieren')).rejects.toMatchObject({
      status: 403,
      message: 'Fehlende Rolle',
    });
  });

  it('wirft 401 ohne Token, ohne Anfrage zu senden', async () => {
    let aufgerufen = false;
    const client = erstelleApiClient({
      basisUrl: 'http://core',
      token: async () => undefined,
      fetcher: (async () => {
        aufgerufen = true;
        return new Response('{}');
      }) as unknown as typeof fetch,
    });
    await expect(client.get('/v1/fahrzeuge')).rejects.toBeInstanceOf(ApiFehler);
    expect(aufgerufen).toBe(false);
  });

  it('sendet Änderungen als PATCH mit JSON-Körper', async () => {
    const merke: { url?: string; init?: RequestInit } = {};
    const client = erstelleApiClient({
      basisUrl: 'http://kern',
      token: async () => 't',
      fetcher: fakeFetch(200, { id: 'k1', geaendert: ['ort'] }, merke),
    });
    await expect(client.patch('/v1/kunden/k1', { version: 'v', ort: 'Potsdam' })).resolves.toEqual({
      id: 'k1',
      geaendert: ['ort'],
    });
    expect(merke.init?.method).toBe('PATCH');
    expect(merke.init?.body).toBe(JSON.stringify({ version: 'v', ort: 'Potsdam' }));
  });
});
