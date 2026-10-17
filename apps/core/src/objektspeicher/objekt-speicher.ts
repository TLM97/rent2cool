/**
 * Objektspeicher für Fotos und Dateien (D-003: nie in die Datenbank). Über das
 * Interface austauschbar; produktiv jeder S3-kompatible Speicher (D-001),
 * lokal SeaweedFS (Vorschlag D-019).
 *
 * Hochladen läuft direkt vom Gerät in den Speicher (signierter Link, kurze
 * Gültigkeit) – die Anwendungsserver bleiben schlank und zustandslos.
 */
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const OBJEKT_SPEICHER = Symbol('OBJEKT_SPEICHER');

export interface HochladeLink {
  url: string;
  methode: 'PUT';
  /** Diese Kopfzeilen muss der Upload genau so mitschicken (Teil der Signatur). */
  kopfzeilen: Record<string, string>;
  gueltigBis: Date;
}

export interface ObjektInfo {
  groesse: number;
  contentType: string | undefined;
}

export interface ObjektSpeicher {
  hochladeLink(schluessel: string, contentType: string, gueltigSek: number): Promise<HochladeLink>;
  ladeLink(schluessel: string, gueltigSek: number): Promise<string>;
  /** `null`, wenn das Objekt (noch) nicht existiert. */
  info(schluessel: string): Promise<ObjektInfo | null>;
  /** SHA-256 (hex) des gespeicherten Inhalts. */
  sha256(schluessel: string): Promise<string>;
  /** Direkt ablegen (Server-seitig, z. B. Demo-Daten). */
  ablegen(schluessel: string, contentType: string, daten: Buffer): Promise<void>;
}

export interface S3Einstellungen {
  endpoint: string;
  oeffentlicherEndpoint?: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  forcePathStyle: boolean;
}

export class S3ObjektSpeicher implements ObjektSpeicher {
  private readonly intern: S3Client;
  /** Signiert Links mit der Adresse, die Browser und App erreichen. */
  private readonly oeffentlich: S3Client;

  constructor(private readonly e: S3Einstellungen) {
    const basis: S3ClientConfig = {
      region: e.region,
      forcePathStyle: e.forcePathStyle,
      credentials: { accessKeyId: e.accessKey, secretAccessKey: e.secretKey },
      // Prüfsummen rechnet der Kern selbst (nicht jeder S3-Speicher kann sie, D-019).
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    };
    this.intern = new S3Client({ ...basis, endpoint: e.endpoint });
    this.oeffentlich = new S3Client({ ...basis, endpoint: e.oeffentlicherEndpoint ?? e.endpoint });
  }

  async hochladeLink(schluessel: string, contentType: string, gueltigSek: number) {
    const url = await getSignedUrl(
      this.oeffentlich,
      new PutObjectCommand({ Bucket: this.e.bucket, Key: schluessel, ContentType: contentType }),
      // Content-Type ist Teil der Signatur: ein anderer Typ wird abgewiesen.
      { expiresIn: gueltigSek, signableHeaders: new Set(['content-type']) },
    );
    return {
      url,
      methode: 'PUT' as const,
      kopfzeilen: { 'content-type': contentType },
      gueltigBis: new Date(Date.now() + gueltigSek * 1000),
    };
  }

  ladeLink(schluessel: string, gueltigSek: number): Promise<string> {
    return getSignedUrl(
      this.oeffentlich,
      new GetObjectCommand({ Bucket: this.e.bucket, Key: schluessel }),
      { expiresIn: gueltigSek },
    );
  }

  async info(schluessel: string): Promise<ObjektInfo | null> {
    try {
      const h = await this.intern.send(
        new HeadObjectCommand({ Bucket: this.e.bucket, Key: schluessel }),
      );
      return { groesse: h.ContentLength ?? 0, contentType: h.ContentType };
    } catch (e: unknown) {
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw e;
    }
  }

  async sha256(schluessel: string): Promise<string> {
    const r = await this.intern.send(
      new GetObjectCommand({ Bucket: this.e.bucket, Key: schluessel }),
    );
    const hash = createHash('sha256');
    for await (const teil of r.Body as Readable) hash.update(teil as Buffer);
    return hash.digest('hex');
  }

  async ablegen(schluessel: string, contentType: string, daten: Buffer): Promise<void> {
    await this.intern.send(
      new PutObjectCommand({
        Bucket: this.e.bucket,
        Key: schluessel,
        ContentType: contentType,
        Body: daten,
      }),
    );
  }
}

/** Für Unit-Tests ohne Speicher: hält Objekte im Arbeitsspeicher. */
export class InMemoryObjektSpeicher implements ObjektSpeicher {
  readonly objekte = new Map<string, { contentType: string; daten: Buffer }>();

  async hochladeLink(schluessel: string, contentType: string, gueltigSek: number) {
    return {
      url: `memory://${schluessel}`,
      methode: 'PUT' as const,
      kopfzeilen: { 'content-type': contentType },
      gueltigBis: new Date(Date.now() + gueltigSek * 1000),
    };
  }
  async ladeLink(schluessel: string): Promise<string> {
    return `memory://${schluessel}`;
  }
  async info(schluessel: string): Promise<ObjektInfo | null> {
    const o = this.objekte.get(schluessel);
    return o ? { groesse: o.daten.length, contentType: o.contentType } : null;
  }
  async sha256(schluessel: string): Promise<string> {
    return createHash('sha256').update(this.objekte.get(schluessel)!.daten).digest('hex');
  }
  async ablegen(schluessel: string, contentType: string, daten: Buffer): Promise<void> {
    this.objekte.set(schluessel, { contentType, daten });
  }
}

/** Einstellungen aus der Umgebung (gleiche Variablen wie in .env.example). */
export function s3AusUmgebung(env: Record<string, string | undefined>): S3Einstellungen {
  const pflicht = (k: string) => {
    const v = env[k];
    if (!v) throw new Error(`${k} ist nicht gesetzt`);
    return v;
  };
  return {
    endpoint: pflicht('S3_ENDPOINT'),
    oeffentlicherEndpoint: env.S3_OEFFENTLICHER_ENDPOINT || undefined,
    region: env.S3_REGION ?? 'eu-central-1',
    accessKey: pflicht('S3_ACCESS_KEY'),
    secretKey: pflicht('S3_SECRET_KEY'),
    bucket: pflicht('S3_BUCKET'),
    forcePathStyle: (env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
  };
}
