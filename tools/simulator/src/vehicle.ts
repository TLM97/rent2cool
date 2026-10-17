/**
 * Ein virtuelles Fahrzeug. Erzeugt je Zeitpunkt eine neutrale
 * Telematik-Nachricht mit ~10 Messwerten (D-003). Die Laderaumtemperatur
 * stammt begrifflich vom Kühlaufbau (D-012), ist hier aber Teil derselben
 * simulierten Quelle.
 */
import { randomUUID } from 'node:crypto';
import type { TelemetrieNachricht, TelemetrieWert } from '@rent2cool/shared';

export interface Temperaturprofil {
  readonly name: string;
  readonly minC: number;
  readonly maxC: number;
}

/** Profile nach D-008. */
export const PROFILE: Temperaturprofil[] = [
  { name: '2-8', minC: 2, maxC: 8 },
  { name: '15-25', minC: 15, maxC: 25 },
];

export interface VehicleOpts {
  fahrzeugId: string;
  profil: Temperaturprofil;
  /** Wahrscheinlichkeit (0..1) einer offenen Tür je Nachricht. */
  tuerRate: number;
  /** Wahrscheinlichkeit (0..1) eines Temperatur-Ausreißers (Alarmtest). */
  ausreisserRate: number;
}

export class VirtualVehicle {
  private km = Math.random() * 100_000;
  private tempC: number;
  private lat = 51.0 + Math.random() * 2;
  private lng = 9.0 + Math.random() * 3;

  constructor(private readonly opts: VehicleOpts) {
    this.tempC = (opts.profil.minC + opts.profil.maxC) / 2;
  }

  private naechsteTemp(): { tempC: number; ausreisser: boolean } {
    const { minC, maxC } = this.opts.profil;
    // Leichtes Rauschen um die Bandmitte, innerhalb der Grenzen gehalten.
    const mitte = (minC + maxC) / 2;
    this.tempC += (Math.random() - 0.5) * 0.6 + (mitte - this.tempC) * 0.1;
    this.tempC = Math.min(maxC, Math.max(minC, this.tempC));

    if (Math.random() < this.opts.ausreisserRate) {
      // Ausreißer über die Obergrenze hinaus -> löst später einen Alarm aus.
      return { tempC: maxC + 2 + Math.random() * 3, ausreisser: true };
    }
    return { tempC: Number(this.tempC.toFixed(2)), ausreisser: false };
  }

  /** Erzeugt eine Nachricht für den angegebenen Zeitpunkt. */
  erzeuge(zeit: Date): TelemetrieNachricht {
    this.km += Math.random() * 1.5;
    this.lat += (Math.random() - 0.5) * 0.01;
    this.lng += (Math.random() - 0.5) * 0.01;
    const geschwindigkeit = Math.random() < 0.3 ? 0 : 30 + Math.random() * 60;
    const tuerOffen = Math.random() < this.opts.tuerRate ? 1 : 0;
    const { tempC } = this.naechsteTemp();
    const iso = zeit.toISOString();

    const messwerte: TelemetrieWert[] = [
      { messgroesse: 'temperatur_laderaum', wert: tempC, einheit: 'C' },
      {
        messgroesse: 'temperatur_aussen',
        wert: Number((8 + Math.random() * 15).toFixed(2)),
        einheit: 'C',
      },
      { messgroesse: 'position_lat', wert: Number(this.lat.toFixed(6)), einheit: 'grad' },
      { messgroesse: 'position_lng', wert: Number(this.lng.toFixed(6)), einheit: 'grad' },
      { messgroesse: 'kilometerstand', wert: Number(this.km.toFixed(1)), einheit: 'km' },
      { messgroesse: 'geschwindigkeit', wert: Number(geschwindigkeit.toFixed(1)), einheit: 'kmh' },
      { messgroesse: 'tuer_offen', wert: tuerOffen, einheit: 'bool' },
      { messgroesse: 'wegfahrsperre', wert: geschwindigkeit === 0 ? 1 : 0, einheit: 'bool' },
      { messgroesse: 'batterie', wert: Number((12 + Math.random()).toFixed(2)), einheit: 'v' },
      {
        messgroesse: 'luftfeuchte',
        wert: Number((40 + Math.random() * 20).toFixed(1)),
        einheit: 'pct',
      },
    ];

    return {
      nachrichtId: randomUUID(),
      fahrzeugId: this.opts.fahrzeugId,
      quelle: 'simulator',
      gesendetAm: iso,
      messwerte,
    };
  }
}

/** Erzeugt `anzahl` Fahrzeuge mit abwechselnden Profilen. */
export function erzeugeFlotte(
  anzahl: number,
  opts: { tuerRate: number; ausreisserRate: number },
): VirtualVehicle[] {
  const flotte: VirtualVehicle[] = [];
  for (let i = 0; i < anzahl; i++) {
    flotte.push(
      new VirtualVehicle({
        fahrzeugId: randomUUID(),
        profil: PROFILE[i % PROFILE.length]!,
        tuerRate: opts.tuerRate,
        ausreisserRate: opts.ausreisserRate,
      }),
    );
  }
  return flotte;
}
