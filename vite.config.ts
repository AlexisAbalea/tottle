import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works on GitHub Pages (/tottle/) and inside Capacitor later.
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
