import { describe, expect, it } from 'vitest';
import { portalCookies, sitzungsCookieName } from './cookies';

describe('Portal-Cookies', () => {
  it('eigenes Präfix – kollidiert nicht mit der Admin-Oberfläche (next-auth.*)', () => {
    const c = portalCookies(false);
    const namen = Object.values(c).map((x) => x!.name);
    expect(namen).toHaveLength(6);
    for (const n of namen) expect(n.startsWith('r2c-portal.')).toBe(true);
    expect(c.sessionToken!.name).toBe(sitzungsCookieName(false));
    expect(c.sessionToken!.options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    });
  });

  it('unter HTTPS sichere Präfixe', () => {
    const c = portalCookies(true);
    expect(c.sessionToken!.name).toBe('__Secure-r2c-portal.session-token');
    expect(c.csrfToken!.name).toBe('__Host-r2c-portal.csrf-token');
    expect(c.sessionToken!.options.secure).toBe(true);
    expect(sitzungsCookieName(true)).toBe('__Secure-r2c-portal.session-token');
  });
});
