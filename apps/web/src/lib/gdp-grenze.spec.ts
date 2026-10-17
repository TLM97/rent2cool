/**
 * GDP-Grenze (ROADMAP Architekturregel 2, D-002) als Test:
 * - Die öffentliche Website (alle Seiten außerhalb von Portal, Einladung,
 *   Anmeldung und Auth-Routen) spricht nicht mit der Kern-API und nutzt
 *   keine Server Actions des Portals.
 * - Das ganze Paket hat keinen Datenbankzugang und kein Dienstkonto: Das
 *   Portal handelt ausschließlich mit dem Token des angemeldeten Kunden.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '..');
const APP = path.join(SRC, 'app');
const GESCHUETZT = ['portal', 'einladung', 'anmelden', 'api'];

function dateien(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return dateien(p);
    return /\.(ts|tsx)$/.test(n) && !n.endsWith('.spec.ts') ? [p] : [];
  });
}

describe('GDP-Grenze', () => {
  it('öffentliche Seiten importieren weder Kern-API noch Portal-Aktionen', () => {
    const oeffentlich = dateien(APP).filter(
      (d) => !GESCHUETZT.includes(path.relative(APP, d).split(path.sep)[0]!),
    );
    expect(oeffentlich.length).toBeGreaterThan(0);
    for (const d of oeffentlich) {
      const quelle = readFileSync(d, 'utf8');
      expect(quelle, path.relative(SRC, d)).not.toMatch(/lib\/api['"]|aktionen['"]|api-client/);
      expect(quelle, path.relative(SRC, d)).not.toMatch(/'use server'/);
    }
  });

  it('kein Datenbankzugang, kein Dienstkonto im Paket', () => {
    const pkg = JSON.parse(readFileSync(path.join(SRC, '..', 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    for (const verboten of ['drizzle-orm', 'postgres', 'pg', 'ioredis', 'bullmq']) {
      expect(pkg.dependencies[verboten], verboten).toBeUndefined();
    }
    for (const d of dateien(SRC)) {
      const quelle = readFileSync(d, 'utf8');
      expect(quelle, path.relative(SRC, d)).not.toMatch(
        /DATABASE_URL|OIDC_CLIENT_SECRET\b(?<!PORTAL_OIDC_CLIENT_SECRET)|client_credentials|serviceAccount/,
      );
    }
  });
});
