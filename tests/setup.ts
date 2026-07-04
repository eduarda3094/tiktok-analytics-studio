/**
 * Vitest setup — runs before each test file.
 *
 * - Sets test env vars (no real NVIDIA NIM key, isolated SQLite DB)
 * - Silences console.log during tests (keeps console.error)
 *
 * DATABASE_URL resolution:
 *   1. If TEST_DB_PATH env var is set (CI), use it
 *   2. If DATABASE_URL is already set, keep it
 *   3. Default: <project>/db/test.db
 */

import path from "path";

process.env.NODE_ENV = "test";
process.env.NVIDIA_NIM_API_KEY = process.env.NVIDIA_NIM_API_KEY || "";

// Resolve test DB path
if (!process.env.DATABASE_URL) {
  const testDbPath = process.env.TEST_DB_PATH || path.join(process.cwd(), "db", "test.db");
  process.env.DATABASE_URL = `file:${testDbPath}`;
}

// Suppress console.log/info during tests (keep warn/error)
const originalLog = console.log;
const originalInfo = console.info;
console.log = (...args: unknown[]) => { /* silenced */ };
console.info = (...args: unknown[]) => { /* silenced */ };

// Restore on exit
process.on("exit", () => {
  console.log = originalLog;
  console.info = originalInfo;
});
