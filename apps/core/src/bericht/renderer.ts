/**
 * Ausgabeformate des Nachweises. Über das Interface ist das Format frei
 * austauschbar/erweiterbar (JSON für Systeme, PDF für Menschen; CSV o. Ä.
 * als weiterer Renderer, ohne Änderung an Erzeugung oder Speicher).
 */
import type { NachweisDokument } from '@rent2cool/shared';
import { PdfNachweisRenderer } from './pdf-renderer';

export interface NachweisRenderer {
  readonly format: string;
  readonly contentType: string;
  readonly dateiendung: string;
  render(dokument: NachweisDokument): Promise<Buffer>;
}

export class JsonNachweisRenderer implements NachweisRenderer {
  readonly format = 'json';
  readonly contentType = 'application/json';
  readonly dateiendung = 'json';
  async render(dokument: NachweisDokument): Promise<Buffer> {
    return Buffer.from(JSON.stringify(dokument, null, 2), 'utf8');
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

/** Alle Formate des Kerns (eine Stelle für Module, Demo und Tests). */
export function standardRenderer(): RendererRegistry {
  return new RendererRegistry([new JsonNachweisRenderer(), new PdfNachweisRenderer()]);
}
