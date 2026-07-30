import { defineConfig } from 'vitest/config';

// Separate config: these tests need a running Firestore emulator and are slower
// than the pure-domain unit tests, so they don't run on every `pnpm test`.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: false,
  },
});
