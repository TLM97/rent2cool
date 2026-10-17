/**
 * Anmeldung im Kundenportal über Keycloak (OpenID Connect, Authorization
 * Code + PKCE), eigener Client `rent2cool-portal`. Wie in der Admin-Oberfläche
 * bleibt das Zugriffstoken im verschlüsselten Sitzungs-Cookie auf dem Server.
 *
 * Eigenes Secret und eigene Cookie-Namen: Admin (3002) und Portal (3003)
 * laufen lokal unter demselben Host, und Cookies kennen keine Ports – sonst
 * überschrieben sich die Sitzungen gegenseitig.
 *
 * Rollen kommen NICHT aus dem Token: Kundenrollen stehen im Kern
 * (`kunde_konto`, D-020) und kommen über `GET /v1/ich`.
 */
import type { NextAuthOptions } from 'next-auth';
import KeycloakProvider from 'next-auth/providers/keycloak';
import { portalCookies } from './cookies';

export function issuerUrl(): string {
  return process.env.OIDC_ISSUER_URL ?? 'http://localhost:8080/realms/rent2cool';
}

export function portalUrl(): string {
  return process.env.PORTAL_URL ?? 'http://localhost:3003';
}

export function portalClientId(): string {
  return process.env.PORTAL_OIDC_CLIENT_ID ?? 'rent2cool-portal';
}

export function portalSecret(): string | undefined {
  return process.env.PORTAL_NEXTAUTH_SECRET;
}

// next-auth liest seine eigene Adresse aus NEXTAUTH_URL; die zentrale .env
// setzt sie für die Admin-Oberfläche. Das Portal nutzt PORTAL_URL.
process.env.NEXTAUTH_URL = portalUrl();

export const COOKIES = portalCookies(portalUrl().startsWith('https://'));

/**
 * Zweiter Weg zum selben Keycloak-Client: öffnet direkt das
 * Registrierungsformular (Keycloak-Endpunkt `registrations`; `prompt=create`
 * kennt Keycloak 26.0 noch nicht). Ohne Discovery, damit der Endpunkt gilt.
 */
export function registrierungsEndpunkte(issuer: string) {
  const oidc = `${issuer}/protocol/openid-connect`;
  return {
    wellKnown: undefined,
    authorization: { url: `${oidc}/registrations`, params: { scope: 'openid email profile' } },
    token: { url: `${oidc}/token` },
    userinfo: { url: `${oidc}/userinfo` },
    jwks_endpoint: `${oidc}/certs`,
  };
}

const anbieter = {
  clientId: portalClientId(),
  clientSecret: process.env.PORTAL_OIDC_CLIENT_SECRET ?? '',
  issuer: issuerUrl(),
  checks: ['pkce', 'state'] as ('pkce' | 'state')[],
};

export const authOptions: NextAuthOptions = {
  providers: [
    KeycloakProvider(anbieter),
    KeycloakProvider({
      ...anbieter,
      id: 'keycloak-registrierung',
      name: 'Konto anlegen',
      ...registrierungsEndpunkte(issuerUrl()),
    }),
  ],
  secret: portalSecret(),
  cookies: COOKIES,
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  pages: { signIn: '/anmelden' },
  callbacks: {
    jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    session({ session }) {
      // Keine Tokens an den Browser.
      return session;
    },
  },
};
