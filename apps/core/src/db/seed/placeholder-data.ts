/**
 * Platzhalter-Stammdaten nach D-015. Ausschließlich erfundene Testdaten –
 * keine echten Personen- oder Kundendaten (D-015-Regel: solange `dpo` ein
 * Platzhalter ist, nur erfundene Testdaten). Alle Werte sind an `PLACEHOLDER_`
 * erkennbar und müssen vor dem Go-live ersetzt werden.
 */

export interface GeoPunkt {
  readonly lat: number;
  readonly lng: number;
}

export interface PlatzhalterStandort {
  readonly key: 'PLACEHOLDER_HQ';
  readonly name: string;
  readonly strasse: string;
  readonly plz: string;
  readonly ort: string;
  readonly land: 'DE';
  /** Einfacher kreisförmiger Geofence (Mittelpunkt + Radius in Metern), D-011. */
  readonly geofence: { readonly center: GeoPunkt; readonly radiusM: number };
}

/**
 * Firmenstandort-Platzhalter bis der Sitz feststeht (D-011/D-015).
 * Werte können per .env überschrieben werden (siehe .env.example).
 */
export function placeholderHq(env: NodeJS.ProcessEnv = process.env): PlatzhalterStandort {
  return {
    key: 'PLACEHOLDER_HQ',
    name: env.PLACEHOLDER_HQ_NAME ?? 'Rent2Cool HQ (Platzhalter)',
    strasse: env.PLACEHOLDER_HQ_STREET ?? 'Musterstraße 1',
    plz: env.PLACEHOLDER_HQ_ZIP ?? '00000',
    ort: env.PLACEHOLDER_HQ_CITY ?? 'Musterstadt',
    land: 'DE',
    // Fantasie-Koordinaten (geografische Mitte DE als Platzhalter), radius 500 m.
    geofence: { center: { lat: 51.1657, lng: 10.4515 }, radiusM: 500 },
  };
}

/** Platzhalter-Datenschutzbeauftragter bis externer DSB beauftragt (D-015). */
export function placeholderDpo(env: NodeJS.ProcessEnv = process.env) {
  return {
    key: 'PLACEHOLDER_DPO',
    name: env.PLACEHOLDER_DPO_NAME ?? 'PLACEHOLDER_DPO',
    email: env.PLACEHOLDER_DPO_EMAIL ?? 'dpo@rent2cool.example',
  };
}
