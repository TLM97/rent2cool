import { defineConfig } from '@playwright/test';

/**
 * Browser-Test der Admin-Oberfläche gegen einen laufenden lokalen Stack
 * (Keycloak, Kern, Admin). Nicht Teil der CI – lokal mit `pnpm test:e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: process.env.ADMIN_BASE_URL ?? 'http://localhost:3002',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    viewport: { width: 1360, height: 860 },
  },
  reporter: [['list']],
});
