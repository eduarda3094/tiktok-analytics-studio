import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration.
 * Tests run against the dev server on port 3000.
 *
 * In CI, the `webServer` config starts `npm run dev` automatically.
 * Tests use the same SQLite DB as the dev server (populated by `npx prisma db push`).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // sequential — same DB
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    headless: true,
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.CI
    ? {
        command: "npm run dev",
        url: "http://localhost:3000/api/health",
        timeout: 180 * 1000,
        reuseExistingServer: false,
        env: {
          DATABASE_URL: process.env.DATABASE_URL || "file:/home/runner/work/test.db",
        },
      }
    : undefined,
});
