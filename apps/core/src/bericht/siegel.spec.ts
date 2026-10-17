/**
 * Siegel unabhängig von unserem Code prüfen: Signatur aus dem PDF holen und mit
 * OpenSSL gegen die signierten Bytes (ByteRange) verifizieren – so, wie es ein
 * PDF-Programm tut.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NachweisDokument } from '@rent2cool/shared';
import { PdfNachweisRenderer } from './pdf-renderer';
import { erzeugeTestzertifikat, siegelAusUmgebung, ZertifikatSiegel } from './siegel';

const dokument = {
  schemaVersion: 1,
  titel: 'Temperaturnachweis',
  version: 1,
  ausloeser: 'automatisch',
  miete: null,
  siegel: null,
  nachweis: {
    schemaVersion: 1,
    fahrzeugId: 'f1',
    messgroesse: 'temperatur_laderaum',
    von: '2026-10-16T08:00:00.000Z',
    bis: '2026-10-16T09:00:00.000Z',
    erzeugtAm: '2026-10-16T09:00:01.000Z',
    profil: { name: '2-8', minC: 2, maxC: 8 },
    kennzahlen: {
      anzahl: 0,
      minC: null,
      maxC: null,
      mittelC: null,
      ersteMessung: null,
      letzteMessung: null,
    },
    grenzverletzungen: [],
    luecken: [],
    bewertung: 'unvollstaendig',
    integritaet: { algorithmus: 'HMAC-SHA256', datenHash: 'abc', signatur: 'def' },
  },
  kurve: [],
} as NachweisDokument;

/** Signatur (DER) und signierte Bytes aus einem gesiegelten PDF. */
function zerlege(pdf: Buffer): { signatur: Buffer; inhalt: Buffer } {
  const text = pdf.toString('latin1');
  const m = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(text)!;
  const [a, b, c, d] = m.slice(1).map(Number) as [number, number, number, number];
  const inhalt = Buffer.concat([pdf.subarray(a, a + b), pdf.subarray(c, c + d)]);
  const hex = pdf
    .subarray(a + b + 1, c - 1)
    .toString('latin1')
    .replace(/0+$/, '');
  return { signatur: Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex'), inhalt };
}

describe('Elektronisches Siegel', () => {
  it('Testsiegel: eingebettete Signatur, mit OpenSSL verifizierbar; Änderung bricht sie', async () => {
    const siegel = ZertifikatSiegel.test();
    expect(siegel.info).toMatchObject({ art: 'testsiegel' });
    expect(siegel.info.aussteller).toContain('PLACEHOLDER');

    const pdf = await new PdfNachweisRenderer().render(dokument);
    const gesiegelt = await siegel.siegele(pdf, {
      grund: 'Temperaturnachweis Miete m1, Version 1',
      zeitpunkt: new Date('2026-10-16T09:00:02Z'),
    });
    const text = gesiegelt.toString('latin1');
    expect(text).toContain('/Type /Sig');
    expect(text).toContain('/SubFilter /adbe.pkcs7.detached');

    const dir = mkdtempSync(join(tmpdir(), 'siegel-'));
    const { signatur, inhalt } = zerlege(gesiegelt);
    writeFileSync(join(dir, 'sig.der'), signatur);
    writeFileSync(join(dir, 'inhalt.bin'), inhalt);
    const pruefe = () =>
      execFileSync(
        'openssl',
        [
          'cms',
          '-verify',
          '-binary',
          '-inform',
          'DER',
          '-in',
          'sig.der',
          '-content',
          'inhalt.bin',
          '-noverify',
          '-out',
          '/dev/null',
        ],
        { cwd: dir, stdio: 'pipe' },
      ).toString() + '';
    // -noverify: Testzertifikat ist selbst ausgestellt (keine Vertrauenskette); geprüft wird die Signatur.
    expect(() => pruefe()).not.toThrow();

    // Ein verändertes Byte im Inhalt → Signatur ungültig.
    inhalt[100] = inhalt[100]! ^ 0xff;
    writeFileSync(join(dir, 'inhalt.bin'), inhalt);
    expect(() => pruefe()).toThrow();
  });

  it('eigenes Zertifikat aus der Umgebung (Base64-PKCS#12)', async () => {
    expect(siegelAusUmgebung({}).info.art).toBe('testsiegel');
    const p12 = erzeugeTestzertifikat('Test GmbH Siegel', 'geheim-test');
    const eigen = siegelAusUmgebung({
      SIEGEL_P12_BASE64: p12.toString('base64'),
      SIEGEL_P12_PASSWORT: 'geheim-test',
    });
    expect(eigen.info).toEqual({ art: 'zertifikat', aussteller: 'Test GmbH Siegel' });
    const pdf = await new PdfNachweisRenderer().render(dokument);
    const g = await eigen.siegele(pdf, { grund: 'Test', zeitpunkt: new Date() });
    expect(g.toString('latin1')).toContain('/Name (Test GmbH Siegel)');
    // Dasselbe Siegel siegelt beliebig oft (der Dienst läuft dauerhaft).
    const g2 = await eigen.siegele(pdf, { grund: 'Test 2', zeitpunkt: new Date() });
    expect(g2.toString('latin1')).toContain('/Type /Sig');
  });
});
