/**
 * Ablage des erzeugten Nachweises. Über das Interface frei austauschbar.
 *
 * - `InMemoryBerichtSpeicher`: Standard für Tests/lokal ohne S3.
 * - Produktiv gehört der Nachweis in den Objektspeicher (S3/MinIO, D-003:
 *   „Dateien nie in die DB"). Eine `S3BerichtSpeicher`-Implementierung steckt
 *   man über dasselbe Interface ein (TODO: Anbindung, sobald ein
 *   S3-kompatibler Speicher lokal verfügbar ist – MinIO-Image aktuell nicht
 *   ziehbar; siehe docs/STATUS.md).
 */
export interface GespeicherterBericht {
  readonly ref: string;
  readonly contentType: string;
  readonly groesse: number;
}

export interface BerichtSpeicher {
  ablegen(pfad: string, contentType: string, daten: Buffer): Promise<GespeicherterBericht>;
}

export class InMemoryBerichtSpeicher implements BerichtSpeicher {
  readonly ablage = new Map<string, Buffer>();
  async ablegen(pfad: string, contentType: string, daten: Buffer): Promise<GespeicherterBericht> {
    this.ablage.set(pfad, daten);
    return { ref: `memory://${pfad}`, contentType, groesse: daten.length };
  }
}
