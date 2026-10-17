import { defineConfig } from '@playwright/test';

/**
 * Browser-Test des Kundenportals gegen einen laufenden lokalen Stack
 * (Keycloak, Mailpit, Kern, Portal). Nicht Teil der CI – lokal mit `pnpm test:e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  use: {
    baseURL: process.env.PORTAL_BASE_URL ?? 'http://localhost:3003',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    viewport: { width: 1280, height: 860 },
  },
  reporter: [['list']],
});
