/**
 * Mandant, Standort und Region (D-003, D-011).
 *
 * Mandantentrennung und Standort/Region gehören in jeden relevanten
 * Datensatz, damit das System bei 1.000 Mieten pro Tag über mehrere
 * Standorte und EU-Zonen trägt. Hier nur die Typen; die Durchsetzung
 * (Row-Level-Filter, Indizes) folgt mit dem Datenmodell.
 */
import type { MandantId, StandortId } from './ids';

/** Betrieb zunächst nur Deutschland (D-006); als Aufzählung erweiterbar. */
export const BETRIEBSLAND = ['DE'] as const;
export type Betriebsland = (typeof BETRIEBSLAND)[number];

/**
 * EU-Zone für den Betrieb in mindestens zwei Zonen (D-003). Platzhalter-Werte,
 * bis der Cloud-Anbieter feststeht (D-005/D-015).
 */
export type Region = string;

export interface TenantContext {
  /** Der Mandant (Firmenkunde, D-010), in dessen Kontext gehandelt wird. */
  readonly mandantId: MandantId;
  /** Betroffener Standort, falls die Aktion standortbezogen ist (D-011). */
  readonly standortId?: StandortId;
}
