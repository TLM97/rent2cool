import path from 'node:path';
import type { NextConfig } from 'next';

// `next` läuft immer im Paketverzeichnis apps/admin.
const repoRoot = path.resolve(process.cwd(), '../..');

// Lokal: Umgebungsvariablen aus der zentralen .env im Repo-Root laden (12-Factor,
// D-005). Bestehende Variablen werden nicht überschrieben; in CI/Cloud kommen
// die Werte aus echten Umgebungsvariablen.
try {
  process.loadEnvFile(path.join(repoRoot, '.env'));
} catch {
  // keine .env vorhanden – in Ordnung
}

const config: NextConfig = {
  // Container-Image ohne vollständigen node_modules-Baum (D-005).
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  // Linting läuft repo-weit über `pnpm lint`.
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  // Fotos im Übergabeprotokoll (Ausnahmeprozess mit Personal) laufen über eine
  // Server-Aktion; Obergrenze wie im Kern (FOTO_MAX_BYTES) plus Formularanteil.
  experimental: { serverActions: { bodySizeLimit: '16mb' } },
};

export default config;
