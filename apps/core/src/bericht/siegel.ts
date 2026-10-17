/**
 * Elektronisches Siegel des Temperaturnachweises (F-47, Tom 2026-10-17): Das
 * PDF trägt eine eingebettete digitale Signatur, die Auditoren mit jedem
 * PDF-Programm prüfen können – ohne unser System.
 *
 * Über das Interface austauschbar:
 * - `ZertifikatSiegel`: signiert mit einem PKCS#12-Zertifikat. Ohne
 *   Konfiguration ein zur Laufzeit erzeugtes, deutlich gekennzeichnetes
 *   **Testsiegel** (selbst ausgestellt, nie im Repo).
 * - TODO(D-015): qualifiziertes Siegel über einen Vertrauensdiensteanbieter
 *   (eIDAS, Fernsignatur z. B. per CSC-API) als weitere Umsetzung, sobald der
 *   Anbieter gewählt ist. Erst damit ist das Siegel PAdES-Baseline-konform
 *   und rechtlich ein qualifiziertes elektronisches Siegel.
 */
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';
import signpdf from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';
import forge from 'node-forge';
import type { NachweisSiegel } from '@rent2cool/shared';

export const SIEGELDIENST = Symbol('SIEGELDIENST');

/** `testsiegel` (Platzhalter), `zertifikat` (eigenes Zertifikat) oder später `qualifiziert`. */
export type SiegelInfo = NachweisSiegel;

export interface Siegeldienst {
  readonly info: SiegelInfo;
  /** PDF siegeln; liefert das gesiegelte PDF. */
  siegele(pdf: Buffer, o: { grund: string; zeitpunkt: Date }): Promise<Buffer>;
}

/** Selbst ausgestelltes Testzertifikat als PKCS#12 (nur Arbeitsspeicher). */
export function erzeugeTestzertifikat(inhaber: string, passwort: string): Buffer {
  const schluessel = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = schluessel.publicKey;
  cert.serialNumber = `01${forge.util.bytesToHex(forge.random.getBytesSync(8))}`;
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 2 * 365 * 86_400_000);
  const name = [
    { name: 'commonName', value: inhaber },
    { name: 'organizationName', value: 'Rent2Cool (PLACEHOLDER, D-015)' },
    { name: 'countryName', value: 'DE' },
  ];
  cert.setSubject(name);
  cert.setIssuer(name);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
  ]);
  cert.sign(schluessel.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(schluessel.privateKey, [cert], passwort, {
    algorithm: '3des',
  });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}

/** Inhaber (CN) eines PKCS#12-Zertifikats. */
function inhaberVon(p12: Buffer, passwort: string): string {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12.toString('binary')));
  const p = forge.pkcs12.pkcs12FromAsn1(asn1, passwort);
  const taschen = p.getBags({ bagType: forge.pki.oids.certBag! })[forge.pki.oids.certBag!] ?? [];
  const cn = taschen[0]?.cert?.subject.getField('CN')?.value;
  return typeof cn === 'string' ? cn : 'unbekannt';
}

export class ZertifikatSiegel implements Siegeldienst {
  readonly info: SiegelInfo;

  constructor(
    private readonly p12: Buffer,
    private readonly passwort: string,
    art: SiegelInfo['art'],
  ) {
    this.info = { art, aussteller: inhaberVon(p12, passwort) };
  }

  /** Testsiegel ohne Konfiguration – jeder Prozessstart erzeugt ein neues Zertifikat. */
  static test(): ZertifikatSiegel {
    const passwort = forge.util.bytesToHex(forge.random.getBytesSync(16));
    const p12 = erzeugeTestzertifikat(
      'Rent2Cool Testsiegel (PLACEHOLDER, kein gültiges Siegel)',
      passwort,
    );
    return new ZertifikatSiegel(p12, passwort, 'testsiegel');
  }

  async siegele(pdf: Buffer, o: { grund: string; zeitpunkt: Date }): Promise<Buffer> {
    const mitPlatz = plainAddPlaceholder({
      pdfBuffer: pdf,
      reason: o.grund,
      contactInfo: 'PLACEHOLDER_KONTAKT (D-015)',
      name: this.info.aussteller,
      location: 'DE',
      signingTime: o.zeitpunkt,
      appName: 'Rent2Cool Berichtsdienst',
    });
    // Je Vorgang ein neuer Signierer: P12Signer liest sein Zertifikat beim
    // Signieren aus einem Puffer, der danach leer ist (zweites Siegeln schlüge fehl).
    const signer = new P12Signer(this.p12, { passphrase: this.passwort });
    return signpdf.sign(mitPlatz, signer, o.zeitpunkt);
  }
}

/** Siegel aus der Umgebung: eigenes Zertifikat (Base64-PKCS#12) oder Testsiegel. */
export function siegelAusUmgebung(env: {
  SIEGEL_P12_BASE64?: string;
  SIEGEL_P12_PASSWORT?: string;
}): Siegeldienst {
  if (env.SIEGEL_P12_BASE64) {
    return new ZertifikatSiegel(
      Buffer.from(env.SIEGEL_P12_BASE64, 'base64'),
      env.SIEGEL_P12_PASSWORT ?? '',
      'zertifikat',
    );
  }
  return ZertifikatSiegel.test();
}
