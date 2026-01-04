// =============================================================================
// The Brain — Vitest Configuration (Phase 3B)
// =============================================================================

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/reducer/**', 'src/context/**'],
    },
    // Ensure deterministic tests
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
