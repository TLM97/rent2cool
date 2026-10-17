/**
 * End-to-End-Nachweis des Fundaments (T-004) gegen die echte DB:
 * Authentifizierung (401), Autorisierung (403/202) und automatischer Audit
 * Trail (Zeile in audit_event, append-only). Nur mit RUN_INTEGRATION=1.
 *
 *   pnpm stack:up
 *   pnpm --filter @rent2cool/core db:migrate
 *   RUN_INTEGRATION=1 pnpm --filter @rent2cool/core test
 */
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Database } from '../db/client';

const RUN = process.env.RUN_INTEGRATION === '1';
const ISSUER = 'https://kc.test/realms/rent2cool';

if (RUN) {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  process.env.TELEMETRY_CONSUMER_ENABLED = 'false';
  process.env.DATABASE_URL ??=
    'postgres://rent2cool:rent2cool_local_dev@localhost:5432/rent2cool_test';
  process.env.OIDC_ISSUER_URL = ISSUER;
  process.env.OIDC_CLIENT_ID ??= 'rent2cool-core';
  process.env.OIDC_CLIENT_SECRET ??= 'x';
  process.env.S3_ENDPOINT ??= 'http://localhost:9000';
  process.env.S3_ACCESS_KEY ??= 'a';
  process.env.S3_SECRET_KEY ??= 'b';
  process.env.S3_BUCKET ??= 'c';
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privPem = privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

function token(sub: string, rollen: string[]): string {
  return jwt.sign({ sub, realm_access: { roles: rollen } }, privPem, {
    algorithm: 'RS256',
    issuer: ISSUER,
    expiresIn: '5m',
  });
}

type SqlFn = (strings: TemplateStringsArray, ...args: unknown[]) => Promise<unknown>;

describe.skipIf(!RUN)('Auth + Audit (Integration, braucht DB)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const { Test } = await import('@nestjs/testing');
    const { FastifyAdapter } = await import('@nestjs/platform-fastify');
    const { AppModule } = await import('../app.module');
    const { JWT_VERIFIER } = await import('./jwt-auth.guard');
    const { JwtVerifier } = await import('./jwt.service');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JWT_VERIFIER)
      .useValue(new JwtVerifier({ issuer: ISSUER, getKey: (_h, cb) => cb(null, pubPem) }))
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('hält /health trotz globaler Guards öffentlich (200 ohne Token)', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('weist ohne Token 401 zurück', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/admin/audit-demo', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('weist falsche Rolle mit 403 zurück', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/audit-demo',
      headers: { authorization: `Bearer ${token('user-ops', ['ops'])}` },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('erlaubt admin (202) und schreibt eine Audit-Zeile', async () => {
    const sub = `user-${Date.now()}`;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/audit-demo',
      headers: { authorization: `Bearer ${token(sub, ['admin'])}` },
      payload: { notiz: 'hallo' },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ status: 'ok', id: 'demo-1', akteur: sub });

    const { DB } = await import('../db/db.module');
    const { auditEvent } = await import('../db/schema/audit');
    const { eq } = await import('drizzle-orm');
    const db = app.get<Database>(DB as symbol);
    const zeilen = await db.select().from(auditEvent).where(eq(auditEvent.akteurId, sub));
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]!.entitaetTyp).toBe('demo');
    expect(zeilen[0]!.neuWert).toMatchObject({ notiz: 'hallo' });
  });

  it('audit_event ist append-only (UPDATE abgewiesen)', async () => {
    const { SQL } = await import('../db/db.module');
    const sql = app.get(SQL as symbol) as SqlFn;
    await expect(sql`update audit_event set aktion = 'x'`).rejects.toThrow();
  });
});
