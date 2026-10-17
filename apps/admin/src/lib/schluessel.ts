/** Anzeige von digitalem Schlüssel und Fahrzeugbefehlen (D-014). */
import { BEFEHL_NAME, FAHRZEUG_BEFEHLE, type FahrzeugBefehl } from '@rent2cool/shared';
import type { Befehl, Schluessel } from './typen';

/** Auswahl im Fernzugriff, in der Reihenfolge Türen → Wegfahrsperre. */
export const BEFEHL_OPTIONEN: readonly { wert: FahrzeugBefehl; text: string }[] =
  FAHRZEUG_BEFEHLE.map((b) => ({ wert: b, text: BEFEHL_NAME[b] }));

/** Wer hat den Befehl ausgelöst? */
export function befehlVon(b: Pick<Befehl, 'fahrerName' | 'schluesselId'>): string {
  if (b.schluesselId)
    return b.fahrerName ? `Fahrer ${b.fahrerName} (Schlüssel)` : 'Fahrerschlüssel';
  return 'Betrieb';
}

/** Begründung (Ops) bzw. Ablehnungs-/Fehlergründe in einer Zeile. */
export function befehlDetail(b: Pick<Befehl, 'grund' | 'gruende'>): string {
  return [b.grund, ...(b.gruende ?? [])].filter(Boolean).join(' · ');
}

/** Gültigkeit lesbar: „ab … bis Mietende“ bzw. Widerruf mit Grund. */
export function schluesselGueltigkeit(
  s: Pick<Schluessel, 'status' | 'gueltigBis' | 'widerrufGrund'>,
): string {
  if (s.status === 'widerrufen')
    return `widerrufen${s.widerrufGrund ? ` – ${s.widerrufGrund}` : ''}`;
  return s.gueltigBis ? 'befristet' : 'bis Mietende';
}
