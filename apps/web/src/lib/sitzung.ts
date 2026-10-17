/**
 * Serverseitiger Zugriff auf die Portal-Sitzung (Server Components, Server
 * Actions, Route Handler).
 */
import { cookies } from 'next/headers';
import { getToken, type JWT } from 'next-auth/jwt';
import { portalSecret, portalUrl } from './auth';
import { sitzungsCookieName } from './cookies';

export async function holeSitzung(): Promise<JWT | null> {
  const store = await cookies();
  const req = {
    cookies: Object.fromEntries(store.getAll().map((c) => [c.name, c.value])),
    headers: {},
  };
  return getToken({
    req: req as never,
    secret: portalSecret(),
    cookieName: sitzungsCookieName(portalUrl().startsWith('https://')),
  });
}
