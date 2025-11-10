import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.spec.ts'],
    exclude: ['node_modules', 'dist', '.next'],
  },
  resolve: {
    alias: {
      '@tracer/core': path.resolve(__dirname, './packages/core/src'),
      '@tracer/db': path.resolve(__dirname, './packages/db/src'),
      '@tracer/infra': path.resolve(__dirname, './packages/infra/src'),
      '@tracer/sdk': path.resolve(__dirname, './packages/sdk/src'),
    },
  },
});

