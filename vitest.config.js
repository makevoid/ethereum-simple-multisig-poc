import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    globals: true,
    environment: 'node',
    setupFiles: [],
    reporters: [['default', { summary: false }]]
  }
});