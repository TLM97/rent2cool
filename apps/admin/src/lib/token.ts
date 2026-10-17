/**
 * Reine Helfer rund um das Keycloak-Zugriffstoken. Laufen auch in der
 * Edge-Middleware (keine Node-Module). Die Signatur prüft der Kern; hier geht
 * es nur um Anzeige und Zugangssteuerung der Oberfläche.
 */

/** Rollen mit Zugang zur internen Admin-Oberfläche. */
export const INTERNE_ROLLEN = ['admin', 'ops', 'qa_approver', 'dpo'] as const;

export function dekodiereJwtPayload(jwt: string): Record<string, unknown> | null {
  const teil = jwt.split('.')[1];
  if (!teil) return null;
  try {
    const b64 = teil.replace(/-/g, '+').replace(/_/g, '/');
    const gepolstert = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(gepolstert), (c) => c.charCodeAt(0));
    const json: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function rollenAusAccessToken(jwt: string): string[] {
  const payload = dekodiereJwtPayload(jwt);
  const realm = payload?.realm_access;
  if (typeof realm !== 'object' || realm === null) return [];
  const rollen = (realm as Record<string, unknown>).roles;
  return Array.isArray(rollen) ? rollen.filter((r): r is string => typeof r === 'string') : [];
}

export function hatInternenZugang(rollen: readonly string[]): boolean {
  return rollen.some((r) => (INTERNE_ROLLEN as readonly string[]).includes(r));
}

export function hatRolle(rollen: readonly string[], ...erlaubt: string[]): boolean {
  return erlaubt.some((r) => rollen.includes(r));
}

/** Abgelaufen, wenn `expiresAtSek` fehlt oder (mit Puffer) in der Vergangenheit liegt. */
export function istAbgelaufen(expiresAtSek: number | undefined, jetztMs = Date.now(), pufferMs = 30_000): boolean {
  if (!expiresAtSek) return true;
  return expiresAtSek * 1000 - pufferMs <= jetztMs;
}
