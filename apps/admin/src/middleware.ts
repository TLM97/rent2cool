/**
 * Zugangsschutz: jede Seite außer Anmeldung verlangt eine gültige Sitzung mit
 * interner Rolle. Kundenrollen (kunde_*, fahrer) haben hier keinen Zugang –
 * für sie ist das Kundenportal (apps/web) vorgesehen.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { hatInternenZugang, istAbgelaufen } from './lib/token';

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token || istAbgelaufen(token.expiresAt)) {
    const ziel = new URL('/anmelden', req.url);
    ziel.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
    if (token) {
      ziel.searchParams.set('grund', 'abgelaufen');
    }
    return NextResponse.redirect(ziel);
  }

  if (!hatInternenZugang(token.rollen ?? [])) {
    return NextResponse.redirect(new URL('/kein-zugriff', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/auth|api/abmelden|anmelden|kein-zugriff|_next/static|_next/image|favicon.ico).*)'],
};
