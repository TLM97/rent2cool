import { describe, expect, it } from 'vitest';
import {
  dekodiereJwtPayload,
  hatInternenZugang,
  hatRolle,
  istAbgelaufen,
  rollenAusAccessToken,
} from './token';

function jwtMit(payload: unknown): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `kopf.${b64}.signatur`;
}

describe('Token-Helfer', () => {
  it('liest Realm-Rollen aus dem Zugriffstoken', () => {
    const t = jwtMit({ sub: 'u1', realm_access: { roles: ['admin', 'ops'] } });
    expect(rollenAusAccessToken(t)).toEqual(['admin', 'ops']);
  });

  it('kommt mit Umlauten und kaputten Tokens zurecht', () => {
    expect(dekodiereJwtPayload(jwtMit({ name: 'Jürgen Müßig' }))?.name).toBe('Jürgen Müßig');
    expect(dekodiereJwtPayload('kaputt')).toBeNull();
    expect(rollenAusAccessToken('a.b.c')).toEqual([]);
  });

  it('gewährt Zugang nur internen Rollen', () => {
    expect(hatInternenZugang(['ops'])).toBe(true);
    expect(hatInternenZugang(['qa_approver'])).toBe(true);
    expect(hatInternenZugang(['kunde_dispo', 'fahrer'])).toBe(false);
    expect(hatRolle(['ops'], 'admin', 'ops')).toBe(true);
  });

  it('erkennt abgelaufene Tokens (mit Puffer)', () => {
    const jetzt = 1_000_000_000_000;
    expect(istAbgelaufen(undefined, jetzt)).toBe(true);
    expect(istAbgelaufen(jetzt / 1000 + 3600, jetzt)).toBe(false);
    expect(istAbgelaufen(jetzt / 1000 + 10, jetzt)).toBe(true); // innerhalb 30 s Puffer
  });
});
