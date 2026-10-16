/**
 * Ausgabeformate des Nachweises. Über das Interface ist das Format frei
 * austauschbar/erweiterbar (v1: JSON; PDF/CSV später als weiterer Renderer,
 * ohne Änderung an Erzeugung oder Speicher).
 */
import type { TemperaturNachweis } from '@rent2cool/shared';

export interface NachweisRenderer {
  readonly format: string;
  readonly contentType: string;
  readonly dateiendung: string;
  render(nachweis: TemperaturNachweis): Buffer;
}

export class JsonNachweisRenderer implements NachweisRenderer {
  readonly format = 'json';
  readonly contentType = 'application/json';
  readonly dateiendung = 'json';
  render(nachweis: TemperaturNachweis): Buffer {
    return Buffer.from(JSON.stringify(nachweis, null, 2), 'utf8');
  }
}

export class RendererRegistry {
  private readonly map = new Map<string, NachweisRenderer>();
  constructor(renderer: NachweisRenderer[]) {
    for (const r of renderer) {
      this.map.set(r.format, r);
    }
  }
  hole(format: string): NachweisRenderer | undefined {
    return this.map.get(format);
  }
  formate(): string[] {
    return [...this.map.keys()];
  }
}
