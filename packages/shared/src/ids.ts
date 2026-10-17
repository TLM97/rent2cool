/**
 * Branded ID-Typen. Verhindert, dass z. B. eine FahrzeugId dort landet, wo
 * eine MieteId erwartet wird – reine Compile-Zeit-Prüfung, kein Laufzeitcode.
 */
declare const brand: unique symbol;

export type Branded<T, B extends string> = T & { readonly [brand]: B };

/** UUID v4/v7 als String; die Erzeugung macht die Datenbank bzw. die Nachricht. */
export type Uuid = string;

export type FahrzeugId = Branded<Uuid, 'FahrzeugId'>;
export type MieteId = Branded<Uuid, 'MieteId'>;
export type KundeId = Branded<Uuid, 'KundeId'>;
export type FahrerId = Branded<Uuid, 'FahrerId'>;
export type StandortId = Branded<Uuid, 'StandortId'>;
export type MandantId = Branded<Uuid, 'MandantId'>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Markiert einen bereits geprüften UUID-String als Branded-ID. Nur dort
 * verwenden, wo der Wert sicher eine gültige ID ist (z. B. aus der DB).
 */
export function asId<B extends string>(value: Uuid): Branded<Uuid, B> {
  return value as Branded<Uuid, B>;
}
