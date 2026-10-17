/**
 * Zugangsschutz des Portals: `/portal/**` und die Einladungsseite verlangen
 * eine gültige Sitzung. Rollen prüft der Kern bei jeder Anfrage; die
 * öffentliche Website (alles andere) braucht keine Anmeldung.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { istAbgelaufen } from '@rent2cool/oberflaeche/token';
import { sitzungsCookieName } from './lib/cookies';

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const portalUrl = process.env.PORTAL_URL ?? 'http://localhost:3003';
  const token = await getToken({
    req,
    secret: process.env.PORTAL_NEXTAUTH_SECRET,
    cookieName: sitzungsCookieName(portalUrl.startsWith('https://')),
  });

  if (!token || istAbgelaufen(token.expiresAt)) {
    const ziel = new URL('/anmelden', req.url);
    ziel.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
    if (token) ziel.searchParams.set('grund', 'abgelaufen');
    return NextResponse.redirect(ziel);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/portal/:path*', '/portal', '/einladung'] };
