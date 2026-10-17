/**
 * Ablage des erzeugten Nachweises. Über das Interface frei austauschbar.
 *
 * - `ObjektBerichtSpeicher`: Objektspeicher (S3-API, D-003: „Dateien nie in
 *   die DB“) – Standard im Betrieb.
 * - `InMemoryBerichtSpeicher`: für Unit-Tests ohne Speicher.
 */
import type { ObjektSpeicher } from '../objektspeicher/objekt-speicher';

export interface GespeicherterBericht {
  readonly ref: string;
  readonly contentType: string;
  readonly groesse: number;
}

export interface BerichtSpeicher {
  ablegen(pfad: string, contentType: string, daten: Buffer): Promise<GespeicherterBericht>;
}

/** Ablage im Objektspeicher (S3-API, D-003) – Standard im Betrieb. */
export class ObjektBerichtSpeicher implements BerichtSpeicher {
  constructor(private readonly speicher: ObjektSpeicher) {}
  async ablegen(pfad: string, contentType: string, daten: Buffer): Promise<GespeicherterBericht> {
    await this.speicher.ablegen(pfad, contentType, daten);
    return { ref: `s3://${pfad}`, contentType, groesse: daten.length };
  }
}

export class InMemoryBerichtSpeicher implements BerichtSpeicher {
  readonly ablage = new Map<string, Buffer>();
  async ablegen(pfad: string, contentType: string, daten: Buffer): Promise<GespeicherterBericht> {
    this.ablage.set(pfad, daten);
    return { ref: `memory://${pfad}`, contentType, groesse: daten.length };
  }
}
