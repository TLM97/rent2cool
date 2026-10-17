/** Kurzanzeige für Standorte in Listen. */
import { WOCHENTAGE, type Oeffnungsregeln } from '@rent2cool/shared';

const KURZ: Record<string, string> = {
  mo: 'Mo',
  di: 'Di',
  mi: 'Mi',
  do: 'Do',
  fr: 'Fr',
  sa: 'Sa',
  so: 'So',
};

/** „rund um die Uhr“, „geschlossen“ oder die geöffneten Tage, z. B. „Mo, Di, Mi, Do, Fr, Sa“. */
export function oeffnungKurz(regeln: Oeffnungsregeln | null | undefined): string {
  if (!regeln) return 'rund um die Uhr';
  const tage = WOCHENTAGE.filter((t) => (regeln.woche[t]?.length ?? 0) > 0).map((t) => KURZ[t]);
  return tage.length === 0 ? 'geschlossen' : tage.join(', ');
}

export function adresse(s: {
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string;
}): string {
  return [s.strasse, [s.plz, s.ort].filter(Boolean).join(' '), s.land].filter(Boolean).join(', ');
}
