/**
 * Fristen-/Buchbarkeitslogik der Fahrzeugakte (reine Funktion, testbar).
 *
 * Ein Fahrzeug ist nur buchbar, wenn es `verfuegbar` ist UND jeder aktive
 * Sensor eine gültige (nicht abgelaufene) Kalibrierung hat (EN 12830,
 * R-08/R-09). Ohne gültige Kalibrierung ist ein Temperaturmesswert nicht
 * beweiskräftig – deshalb Sperre bei Ablauf (ROADMAP/R-22-Analogie).
 */
export interface SensorFrist {
  readonly sensorId: string;
  readonly gueltigBis: Date | null;
}

export interface BuchbarkeitErgebnis {
  readonly buchbar: boolean;
  readonly gruende: string[];
}

export function bewerteBuchbarkeit(
  status: string,
  sensoren: SensorFrist[],
  stichtag: Date,
): BuchbarkeitErgebnis {
  const gruende: string[] = [];
  if (status !== 'verfuegbar') {
    gruende.push(`Status ist "${status}", nicht "verfuegbar"`);
  }
  if (sensoren.length === 0) {
    gruende.push('Kein aktiver Sensor mit Kalibrierung erfasst');
  }
  for (const s of sensoren) {
    if (!s.gueltigBis) {
      gruende.push(`Sensor ${s.sensorId}: keine Kalibrierung`);
    } else if (s.gueltigBis.getTime() < stichtag.getTime()) {
      gruende.push(
        `Sensor ${s.sensorId}: Kalibrierung abgelaufen am ${s.gueltigBis.toISOString()}`,
      );
    }
  }
  return { buchbar: gruende.length === 0, gruende };
}
