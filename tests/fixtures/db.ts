/**
 * Test helpers for integration tests.
 *
 * Creates an isolated SQLite database for each test run, seeds it with
 * test fixtures, and exposes the Prisma client + helper functions.
 *
 * NOTE: This helper assumes the test DB has already been created by the
 * test setup (either via npm script or GitHub Action step). It only
 * connects to the existing DB and seeds fixture data.
 */

import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";

// Use an absolute test DB path. Resolves to <project>/db/test.db
const PROJECT_ROOT = process.cwd();
const TEST_DB_PATH = process.env.TEST_DB_PATH || path.join(PROJECT_ROOT, "db", "test.db");

let prisma: PrismaClient | null = null;

/**
 * Connect to the test database. The DB schema must already exist
 * (created by `npx prisma db push` in the test setup step).
 *
 * This also overrides the global PrismaClient used by src/lib/db.ts
 * so that all modules (deep-analysis, etc.) use the test DB.
 */
export async function setupTestDb(): Promise<PrismaClient> {
  // Verify the DB file exists
  try {
    await fs.access(TEST_DB_PATH);
  } catch {
    throw new Error(
      `Test DB not found at ${TEST_DB_PATH}. Run "npm run db:push:test" ` +
      `before running tests.`
    );
  }

  // Override DATABASE_URL so src/lib/db.ts picks up the test DB
  process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;

  prisma = new PrismaClient({
    datasources: { db: { url: `file:${TEST_DB_PATH}` } },
  });
  await prisma.$connect();

  // Override the global PrismaClient used by src/lib/db.ts
  // so all imported modules use the test DB instead of the production DB
  const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
  // Disconnect the previous global if it exists
  if (globalForPrisma.prisma) {
    try { await globalForPrisma.prisma.$disconnect(); } catch { /* ignore */ }
  }
  globalForPrisma.prisma = prisma;

  // Clean any existing data so each test run starts fresh
  await prisma.video.deleteMany({});
  await prisma.scrapeJob.deleteMany({});

  return prisma;
}

/**
 * Seed the test database with fixture videos.
 */
export async function seedFixtureVideos(client: PrismaClient): Promise<string[]> {
  const ids: string[] = [];
  const fixtures = [
    {
      id: "test-video-1",
      videoUrl: "https://www.tiktok.com/@user1/video/111",
      sourceId: "111",
      videoViews: 1000000,
      likes: 100000,
      comments: 5000,
      shares: 8000,
      saves: 15000,
      authorUsername: "user1",
      duration: 30,
      soundName: "Song A",
      description: "First test video #fyp",
      hashtags: JSON.stringify(["#fyp", "#test"]),
      publishDate: new Date("2025-06-15T10:00:00Z"),
      ocrTitle: "RECEITA TESTE 1",
      ocrConfidence: 95.0,
      transcript: "Este é o primeiro vídeo de teste",
      transcriptEngine: "nvidia-nim",
      likeRate: 10.0,
      commentRate: 0.5,
      shareRate: 0.8,
      processingStatus: "completed",
      source: "url",
    },
    {
      id: "test-video-2",
      videoUrl: "https://www.tiktok.com/@user2/video/222",
      sourceId: "222",
      videoViews: 500000,
      likes: 25000,
      comments: 1200,
      shares: 3000,
      saves: 6000,
      authorUsername: "user2",
      duration: 60,
      soundName: "Song B",
      description: "Second test video #viral",
      hashtags: JSON.stringify(["#viral", "#test"]),
      publishDate: new Date("2025-06-20T15:00:00Z"),
      ocrTitle: null,
      ocrConfidence: 0,
      transcript: null,
      transcriptEngine: null,
      likeRate: 5.0,
      commentRate: 0.24,
      shareRate: 0.6,
      processingStatus: "completed",
      source: "url",
    },
    {
      id: "test-video-3",
      videoUrl: "https://www.tiktok.com/@user1/video/333",
      sourceId: "333",
      videoViews: 2000000,
      likes: 300000,
      comments: 15000,
      shares: 25000,
      saves: 40000,
      authorUsername: "user1",
      duration: 15,
      soundName: "Song C",
      description: "Third test video #viral #fyp",
      hashtags: JSON.stringify(["#viral", "#fyp", "#trending"]),
      publishDate: new Date("2025-07-01T09:00:00Z"),
      ocrTitle: "VÍDEO VIRAL",
      ocrConfidence: 88.5,
      transcript: "Texto transcrito do terceiro vídeo",
      transcriptEngine: "local-whisper",
      likeRate: 15.0,
      commentRate: 0.75,
      shareRate: 1.25,
      processingStatus: "completed",
      source: "url",
    },
  ];

  for (const f of fixtures) {
    await client.video.create({ data: f });
    ids.push(f.id);
  }

  return ids;
}

/**
 * Tear down: disconnect Prisma.
 */
export async function teardownTestDb(): Promise<void> {
  if (prisma) {
    // Clean up data so next test run starts fresh
    try {
      await prisma.video.deleteMany({});
      await prisma.scrapeJob.deleteMany({});
    } catch { /* ignore */ }
    await prisma.$disconnect();
    prisma = null;
  }
}

/**
 * Get the current test Prisma client (must call setupTestDb first).
 */
export function getTestDb(): PrismaClient {
  if (!prisma) throw new Error("Call setupTestDb() first");
  return prisma;
}
