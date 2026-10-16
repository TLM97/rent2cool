/**
 * Signatur des Nachweises (Fälschungssicherheit, R-10). Interface, damit die
 * HMAC-Variante (Platzhalter-Schlüssel, D-015) später ohne Umbau durch eine
 * echte PKI/Signatur ersetzt werden kann.
 */
import { createHmac } from 'node:crypto';

export interface Signierer {
  readonly algorithmus: string;
  signiere(datenHash: string): string;
}

export class HmacSignierer implements Signierer {
  readonly algorithmus = 'HMAC-SHA256';
  constructor(private readonly schluessel: string) {}
  signiere(datenHash: string): string {
    return createHmac('sha256', this.schluessel).update(datenHash, 'utf8').digest('hex');
  }
}
