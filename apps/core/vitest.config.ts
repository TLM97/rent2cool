import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { testDatenbankUrl } from './src/db/testdatenbank';

const integration = process.env.RUN_INTEGRATION === '1';

/**
 * Vitest für den Kern. NestJS nutzt Decorator-Metadaten; `unplugin-swc`
 * transformiert TypeScript inkl. `emitDecoratorMetadata`, damit Tests mit
 * Nest-Decorators laufen.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    globals: true,
    environment: 'node',
    root: '.',
    // Integrationstests: eigene Datenbank (…_test), angelegt und migriert im globalSetup.
    globalSetup: ['./vitest.integration-setup.ts'],
    env: integration ? { DATABASE_URL: testDatenbankUrl() } : {},
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
});
