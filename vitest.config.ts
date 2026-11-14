import { defineConfig } from "vitest/config";

// API tests call the app in-process (app.request) against the local Postgres in .env.test.
export default defineConfig({
  test: {
    // In the loop, each test also goes to the office's live test list (harness/reporters/, $HARNESS_TESTS).
    reporters: process.env.HARNESS_TESTS ? ["default", "./harness/reporters/vitest.mjs"] : undefined,
    include: ["test/**/*.test.ts"],
    env: process.env.DATABASE_URL ? {} : loadEnvTest(),
    // In the loop, a json summary too: harness/quality.py reads it for the office ($HARNESS_QUALITY).
    coverage: { include: ["src/**"], exclude: ["src/server.ts"], thresholds: { lines: 80, functions: 80, branches: 70 },
                ...(process.env.HARNESS_QUALITY ? { reporter: ["text", "json-summary"] } : {}) },
  },
});

function loadEnvTest(): Record<string, string> {
  try {
    process.loadEnvFile(".env.test");
    return { DATABASE_URL: process.env.DATABASE_URL ?? "" };
  } catch {
    return {};
  }
}
