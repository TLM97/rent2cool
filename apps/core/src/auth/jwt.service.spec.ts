import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { JwtVerifier, zuPrincipal } from './jwt.service';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privPem = privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
const ISSUER = 'https://kc.example/realms/rent2cool';

function mint(payload: Record<string, unknown>, opts: jwt.SignOptions = {}): string {
  return jwt.sign(payload, privPem, { algorithm: 'RS256', issuer: ISSUER, ...opts });
}

const verifier = new JwtVerifier({
  issuer: ISSUER,
  getKey: (_header, cb) => cb(null, pubPem),
});

describe('JwtVerifier', () => {
  it('akzeptiert ein gültiges Token und baut den Principal', async () => {
    const token = mint({
      sub: 'user-1',
      realm_access: { roles: ['admin', 'ops', 'unbekannt'] },
      mandant_id: 'm-123',
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    const principal = await verifier.verify(token);
    expect(principal.akteurId).toBe('user-1');
    // Unbekannte Rollen werden herausgefiltert.
    expect(principal.rollen).toEqual(['admin', 'ops']);
    expect(principal.mandantId).toBe('m-123');
  });

  it('lehnt ein abgelaufenes Token ab', async () => {
    const token = mint({
      sub: 'user-1',
      realm_access: { roles: ['admin'] },
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    await expect(verifier.verify(token)).rejects.toBeDefined();
  });

  it('lehnt einen falschen Issuer ab', async () => {
    const fremd = new JwtVerifier({
      issuer: 'https://boese.example/realms/x',
      getKey: (_h, cb) => cb(null, pubPem),
    });
    const token = mint({ sub: 'user-1', realm_access: { roles: ['admin'] } });
    await expect(fremd.verify(token)).rejects.toBeDefined();
  });
});

describe('zuPrincipal', () => {
  it('wirft ohne sub', () => {
    expect(() => zuPrincipal({})).toThrow();
  });
  it('ergibt leere Rollen, wenn realm_access fehlt', () => {
    expect(zuPrincipal({ sub: 'u' }).rollen).toEqual([]);
  });
  it('übernimmt den Anmeldenamen für den Audit Trail', () => {
    expect(zuPrincipal({ sub: 'u', preferred_username: 'ops.dev' }).name).toBe('ops.dev');
    expect(zuPrincipal({ sub: 'u' }).name).toBeUndefined();
  });
});
