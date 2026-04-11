import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/__tests__/**/*.test.js'],
    globals: true,
    // Run each test file in its own isolated context so env vars set
    // per-suite (TEMP_DIR, OUTPUT_DIR, etc.) don't bleed between files.
    isolate: true,
    // Show a clear summary of passed / failed counts
    reporters: ['verbose'],
  },
});
