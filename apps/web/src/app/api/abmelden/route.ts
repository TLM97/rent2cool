/**
 * Abmelden: Portal-Sitzung löschen UND die Keycloak-Sitzung beenden (sonst
 * wäre man über SSO sofort wieder angemeldet). Nur per POST.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { issuerUrl, portalClientId, portalSecret, portalUrl } from '../../../lib/auth';
import { sitzungsCookieName } from '../../../lib/cookies';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sicher = portalUrl().startsWith('https://');
  const token = await getToken({
    req,
    secret: portalSecret(),
    cookieName: sitzungsCookieName(sicher),
  });

  const ziel = new URL(`${issuerUrl()}/protocol/openid-connect/logout`);
  ziel.searchParams.set('post_logout_redirect_uri', `${portalUrl()}/anmelden?grund=abgemeldet`);
  ziel.searchParams.set('client_id', portalClientId());
  if (token?.idToken) ziel.searchParams.set('id_token_hint', token.idToken);

  const res = NextResponse.redirect(ziel, 303);
  for (const cookie of req.cookies.getAll()) {
    if (cookie.name.includes('r2c-portal.')) res.cookies.delete(cookie.name);
  }
  return res;
}
