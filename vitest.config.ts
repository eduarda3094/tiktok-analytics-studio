import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
    ],
    exclude: ["node_modules", ".next", "tests/e2e"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov", "html"],
      reportsDirectory: "./coverage",
      include: [
        "src/lib/**/*.ts",
        "src/app/api/**/*.ts",
      ],
      exclude: [
        "src/lib/db.ts",
        "src/app/api/health/route.ts",
        "**/*.d.ts",
      ],
      thresholds: {
        statements: 25,
        branches: 20,
        functions: 35,
        lines: 25,
      },
    },
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30000,
    // Run tests sequentially (not in parallel) — integration tests share
    // the same SQLite DB and would collide if run concurrently
    pool: "forks",
    singleFork: true,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
