/**
 * Schnittstelle zum Anbieter von digitalem Schlüssel und Fernzugriff
 * (Hersteller-Telematik oder Nachrüstbox). Der Kern entscheidet und
 * protokolliert, der Anbieter führt nur aus.
 *
 * Asynchron gedacht: Echte Anbieter nehmen einen Befehl an und bestätigen die
 * Ausführung oft erst Sekunden später (Rückmeldung → `SchluesselService.schliesseAb`).
 * Wer sofort bestätigt (Simulator), liefert `ergebnis` direkt mit.
 */
import { randomUUID } from 'node:crypto';
import type { FahrzeugBefehl } from '@rent2cool/shared';

export const KEY_PROVIDER = Symbol('KEY_PROVIDER');

export type BefehlErgebnis = { ok: true } | { ok: false; fehler: string };

export interface KeyProvider {
  /** Name für Protokoll und Anzeige, z. B. `simulator`. */
  readonly name: string;
  /** Schlüssel beim Anbieter anlegen; liefert dessen Referenz. */
  stelleAus(s: {
    schluesselId: string;
    fahrzeugId: string;
    fahrerId: string;
    gueltigVon: Date;
    gueltigBis: Date | null;
  }): Promise<{ anbieterRef: string }>;
  /** Schlüssel beim Anbieter sperren. Wiederholbar (bereits gesperrt = ok). */
  widerrufe(anbieterRef: string): Promise<void>;
  /** Befehl an das Fahrzeug übergeben. */
  sendeBefehl(b: {
    befehlId: string;
    fahrzeugId: string;
    befehl: FahrzeugBefehl;
  }): Promise<{ anbieterRef: string; ergebnis?: BefehlErgebnis }>;
}

export interface SimulierterZustand {
  verriegelt: boolean;
  wegfahrsperre: boolean;
}

/**
 * Simulator (D-015) – TODO(D-015): ersetzen, sobald die Mercedes-Lösung oder
 * eine Nachrüstung entschieden ist. Bestätigt sofort und merkt sich den
 * Zustand je Fahrzeug im Speicher (nur für Anzeige und Tests).
 * `stoerung` simuliert ein Fahrzeug ohne Verbindung.
 */
export class SimulatorKeyProvider implements KeyProvider {
  readonly name = 'simulator';
  readonly zustand = new Map<string, SimulierterZustand>();
  readonly gesperrt = new Set<string>();
  readonly stoerung = new Set<string>();

  async stelleAus(): Promise<{ anbieterRef: string }> {
    return { anbieterRef: `sim-key-${randomUUID()}` };
  }

  async widerrufe(anbieterRef: string): Promise<void> {
    this.gesperrt.add(anbieterRef);
  }

  async sendeBefehl(b: {
    befehlId: string;
    fahrzeugId: string;
    befehl: FahrzeugBefehl;
  }): Promise<{ anbieterRef: string; ergebnis: BefehlErgebnis }> {
    const anbieterRef = `sim-cmd-${b.befehlId}`;
    if (this.stoerung.has(b.fahrzeugId)) {
      return {
        anbieterRef,
        ergebnis: { ok: false, fehler: 'Fahrzeug nicht erreichbar (Simulator)' },
      };
    }
    const z = this.zustand.get(b.fahrzeugId) ?? { verriegelt: true, wegfahrsperre: true };
    if (b.befehl === 'entriegeln') z.verriegelt = false;
    if (b.befehl === 'verriegeln') z.verriegelt = true;
    if (b.befehl === 'wegfahrsperre_ein') z.wegfahrsperre = true;
    if (b.befehl === 'wegfahrsperre_aus') z.wegfahrsperre = false;
    this.zustand.set(b.fahrzeugId, z);
    return { anbieterRef, ergebnis: { ok: true } };
  }
}
