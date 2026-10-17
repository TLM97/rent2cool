/**
 * Abmelden: lokale Sitzung löschen UND die Keycloak-Sitzung beenden
 * (sonst wäre man über SSO sofort wieder angemeldet). Nur per POST, damit
 * kein fremder Link einen abmelden kann.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { adminClientId, issuerUrl } from '../../../lib/auth';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const basis = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;

  const ziel = new URL(`${issuerUrl()}/protocol/openid-connect/logout`);
  ziel.searchParams.set('post_logout_redirect_uri', `${basis}/anmelden?grund=abgemeldet`);
  ziel.searchParams.set('client_id', adminClientId());
  if (token?.idToken) {
    ziel.searchParams.set('id_token_hint', token.idToken);
  }

  const res = NextResponse.redirect(ziel, 303);
  for (const cookie of req.cookies.getAll()) {
    if (cookie.name.includes('next-auth')) {
      res.cookies.delete(cookie.name);
    }
  }
  return res;
}
