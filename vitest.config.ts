import { defineConfig } from 'vitest/config';

// Vitest config for the Tavora TS SDK. Tests live in src/**/*.test.ts
// and run against an in-process fetch mock — no live Tavora server
// required for the unit tier. Live integration runs against a real
// backend via TAVORA_API_KEY (see test/live.integration.test.ts when
// it lands; matches the Go SDK's testhelper_test.go pattern).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
});
