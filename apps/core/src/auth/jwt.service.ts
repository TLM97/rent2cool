/**
 * Prüft Zugriffstoken (JWT) von Keycloak und baut daraus einen Principal
 * (T-004). Signaturprüfung über die JWKS des Issuers (RS256), dazu Ablauf und
 * Issuer. Der Key-Resolver ist injizierbar, damit die Logik ohne echten
 * Keycloak testbar ist.
 */
import jwt, { type GetPublicKeyOrSecret, type JwtPayload } from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { istRolle, type Principal, type Rolle } from '@rent2cool/shared';

export interface JwtVerifierOptions {
  issuer: string;
  /** Optional: aud prüfen. Keycloak-Access-Token tragen oft aud="account";
   *  daher standardmäßig aus, Signatur/Issuer/Ablauf sind maßgeblich. */
  audience?: string;
  getKey: GetPublicKeyOrSecret;
}

/** Key-Resolver, der die öffentlichen Schlüssel aus der Keycloak-JWKS lädt. */
export function erzeugeJwksKeyResolver(issuerUrl: string): GetPublicKeyOrSecret {
  const client = new JwksClient({
    jwksUri: `${issuerUrl.replace(/\/$/, '')}/protocol/openid-connect/certs`,
    cache: true,
    rateLimit: true,
  });
  return (header, callback) => {
    client.getSigningKey(header.kid, (err, key) => {
      if (err || !key) {
        callback(err ?? new Error('kein Signaturschlüssel gefunden'));
        return;
      }
      callback(null, key.getPublicKey());
    });
  };
}

export class JwtVerifier {
  constructor(private readonly opts: JwtVerifierOptions) {}

  verify(token: string): Promise<Principal> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        this.opts.getKey,
        {
          algorithms: ['RS256'],
          issuer: this.opts.issuer,
          ...(this.opts.audience ? { audience: this.opts.audience } : {}),
        },
        (err, decoded) => {
          if (err || !decoded || typeof decoded === 'string') {
            reject(err ?? new Error('ungültiges Token'));
            return;
          }
          try {
            resolve(zuPrincipal(decoded));
          } catch (e) {
            reject(e as Error);
          }
        },
      );
    });
  }
}

export function zuPrincipal(p: JwtPayload): Principal {
  if (!p.sub) {
    throw new Error('Token ohne sub');
  }
  const roh: unknown = p.realm_access?.roles;
  const rollen: Rolle[] = (Array.isArray(roh) ? roh : [])
    .filter((r): r is string => typeof r === 'string')
    .filter(istRolle);
  const mandantId = typeof p.mandant_id === 'string' ? p.mandant_id : undefined;
  const name = typeof p.preferred_username === 'string' ? p.preferred_username : undefined;
  return { akteurId: p.sub, rollen, mandantId, name };
}
