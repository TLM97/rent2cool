import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

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
