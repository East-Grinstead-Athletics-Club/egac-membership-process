import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        statements: 80,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/env.d.ts'],
    },
    globals: true,
  },
  resolve: {
    // Allow .js extensions in imports (required for ESM compat with Workers)
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
});
