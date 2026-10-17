/**
 * Cookie-Namen des Portals (eigenes Präfix, damit sie nicht mit der
 * Admin-Oberfläche kollidieren). Rein, damit auch die Edge-Middleware sie nutzt.
 */
import type { CookiesOptions } from 'next-auth';

const NAMEN = {
  sessionToken: 'session-token',
  callbackUrl: 'callback-url',
  csrfToken: 'csrf-token',
  pkceCodeVerifier: 'pkce.code_verifier',
  state: 'state',
  nonce: 'nonce',
} as const;

export function sitzungsCookieName(sicher: boolean): string {
  return `${sicher ? '__Secure-' : ''}r2c-portal.${NAMEN.sessionToken}`;
}

export function portalCookies(sicher: boolean): Partial<CookiesOptions> {
  const optionen = (maxAge?: number) => ({
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: sicher,
    ...(maxAge ? { maxAge } : {}),
  });
  const ergebnis: Partial<CookiesOptions> = {};
  for (const [schluessel, name] of Object.entries(NAMEN) as [keyof typeof NAMEN, string][]) {
    // CSRF-Cookie mit __Host- (ohne Domain, Pfad /) wie next-auth selbst.
    const praefix = sicher ? (schluessel === 'csrfToken' ? '__Host-' : '__Secure-') : '';
    ergebnis[schluessel] = {
      name: `${praefix}r2c-portal.${name}`,
      options: optionen(
        schluessel === 'pkceCodeVerifier' || schluessel === 'state' ? 900 : undefined,
      ),
    };
  }
  return ergebnis;
}
