import path from 'node:path';
import type { NextConfig } from 'next';

// `next` läuft immer im Paketverzeichnis apps/web.
const repoRoot = path.resolve(process.cwd(), '../..');

// Lokal: Umgebungsvariablen aus der zentralen .env im Repo-Root (D-005);
// in CI/Cloud kommen sie aus echten Umgebungsvariablen.
try {
  process.loadEnvFile(path.join(repoRoot, '.env'));
} catch {
  // keine .env vorhanden – in Ordnung
}

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
};

export default config;
