import { defineConfig } from 'vitest/config';

// Server unit tests. The admin client in client/ has its own Vitest setup (client/vitest.config.ts).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    // Rate limiters and other module-level state stay separate per test file
    isolate: true,
    restoreMocks: true,
    unstubEnvs: true,
  },
});
