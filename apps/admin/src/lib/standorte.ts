/**
 * Standorte für Auswahlfelder: die aktiven (wenige je Mandant, D-011). Ein
 * bereits zugeordneter, inzwischen deaktivierter Standort bleibt sichtbar,
 * damit Bearbeiten ihn nicht stillschweigend entfernt.
 */
import { apiGet, apiGetOderNull } from './api';
import type { Liste, Standort } from './typen';

export async function standorteFuerAuswahl(zugeordnet?: string | null): Promise<Standort[]> {
  const aktiv = (
    await apiGet<Liste<Standort>>('/v1/standorte', { aktiv: 'true', limit: 200, offset: 0 })
  ).eintraege;
  if (!zugeordnet || aktiv.some((s) => s.id === zugeordnet)) return aktiv;
  const alt = await apiGetOderNull<Standort>(`/v1/standorte/${zugeordnet}`);
  return alt ? [...aktiv, { ...alt, name: `${alt.name} (deaktiviert)` }] : aktiv;
}
