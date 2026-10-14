import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{js,jsx}"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    testTimeout: 20000,
  },
});