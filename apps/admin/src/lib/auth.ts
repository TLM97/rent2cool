/**
 * Anmeldung über Keycloak (OpenID Connect, Authorization Code + PKCE).
 * Eigene Passwortlogik bauen wir nicht (D-001). Das Zugriffstoken bleibt im
 * verschlüsselten Sitzungs-Cookie auf dem Server; an den Browser gehen nur
 * Anzeigedaten. Läuft das Token ab, meldet sich der Nutzer über die
 * Keycloak-Sitzung (SSO) erneut an – keine Refresh-Logik im Client.
 */
import type { NextAuthOptions } from 'next-auth';
import KeycloakProvider from 'next-auth/providers/keycloak';
import { rollenAusAccessToken } from './token';

export function issuerUrl(): string {
  return process.env.OIDC_ISSUER_URL ?? 'http://localhost:8080/realms/rent2cool';
}

export function adminClientId(): string {
  return process.env.ADMIN_OIDC_CLIENT_ID ?? 'rent2cool-admin';
}

export const authOptions: NextAuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: adminClientId(),
      clientSecret: process.env.ADMIN_OIDC_CLIENT_SECRET ?? '',
      issuer: issuerUrl(),
      checks: ['pkce', 'state'],
    }),
  ],
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  pages: { signIn: '/anmelden' },
  callbacks: {
    jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
        token.expiresAt = account.expires_at;
        token.rollen = account.access_token ? rollenAusAccessToken(account.access_token) : [];
      }
      return token;
    },
    session({ session, token }) {
      // Keine Tokens an den Browser – nur Rollen zur Anzeige.
      session.rollen = token.rollen ?? [];
      return session;
    },
  },
};
