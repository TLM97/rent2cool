/**
 * Rollen und der Request-Principal (T-004).
 *
 * Die Rollen entsprechen den Realm-Rollen in Keycloak (siehe
 * infra/keycloak/rent2cool-realm.json). Anmeldung und Rollenvergabe macht
 * Keycloak (D-001); der Kern setzt die Rechte durch.
 */
export const ROLLEN = [
  'admin',
  'ops',
  'dpo',
  'qa_approver',
  'kunde_dispo',
  'kunde_qa',
  'fahrer',
] as const;

export type Rolle = (typeof ROLLEN)[number];

export function istRolle(wert: string): wert is Rolle {
  return (ROLLEN as readonly string[]).includes(wert);
}

/**
 * Der handelnde Akteur einer Anfrage, aus dem geprüften Token gebaut. Fließt
 * in jede schreibende Aktion und damit in den Audit Trail ein.
 */
export interface Principal {
  /** Subject aus dem Token (Keycloak-Benutzer-ID). */
  readonly akteurId: string;
  /** Realm-Rollen des Akteurs. */
  readonly rollen: readonly Rolle[];
  /** Mandant (Firmenkunde) aus dem Token, falls vorhanden. */
  readonly mandantId?: string;
}

export function hatRolle(principal: Principal, ...erlaubte: Rolle[]): boolean {
  return erlaubte.some((r) => principal.rollen.includes(r));
}
