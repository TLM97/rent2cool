/**
 * Serverseitiger Zugriff auf die Sitzung (nur Server Components, Server Actions
 * und Route Handler). Liest das verschlüsselte next-auth-Cookie, ohne es zu
 * verändern.
 */
import { cookies } from 'next/headers';
import { getToken, type JWT } from 'next-auth/jwt';

export async function holeSitzung(): Promise<JWT | null> {
  const store = await cookies();
  const req = {
    cookies: Object.fromEntries(store.getAll().map((c) => [c.name, c.value])),
    headers: {},
  };
  return getToken({ req: req as never, secret: process.env.NEXTAUTH_SECRET });
}
