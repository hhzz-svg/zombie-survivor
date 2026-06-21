import { defineConfig } from 'vitest/config';

// vitest/config re-exports vite's defineConfig with the `test` field typed.
export default defineConfig({
  server: {
    // Honor the PORT env var (set by tooling) so the dev server lands on the expected port.
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
  },
  test: {
    environment: 'node',
    testTimeout: 20000, // headless sim runs thousands of steps
  },
});
