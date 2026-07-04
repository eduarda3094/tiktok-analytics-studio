/**
 * Vitest setup — runs before each test file.
 *
 * - Sets test env vars (no real NVIDIA NIM key, isolated SQLite DB)
 * - Silences console.log during tests (keeps console.error)
 */

process.env.NODE_ENV = "test";
process.env.NVIDIA_NIM_API_KEY = ""; // empty by default — AI features fall back gracefully
process.env.DATABASE_URL = "file:/home/z/my-project/db/test.db";

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
