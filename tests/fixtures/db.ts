/**
 * Test helpers for integration tests.
 *
 * Creates an isolated SQLite database for each test run, seeds it with
 * test fixtures, and exposes the Prisma client + helper functions.
 */

import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";

const TEST_DB_PATH = "/home/z/my-project/db/test.db";

let prisma: PrismaClient | null = null;

/**
 * Initialize the test database: delete any existing test.db, recreate schema,
 * seed with fixture data. Returns a connected PrismaClient.
 */
export async function setupTestDb(): Promise<PrismaClient> {
  // Delete existing test DB
  try { await fs.unlink(TEST_DB_PATH); } catch { /* ignore */ }
  try { await fs.unlink(TEST_DB_PATH + "-journal"); } catch { /* ignore */ }

  // Push schema to test DB
  const { spawn } = await import("child_process");
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("npx", ["prisma", "db", "push", "--skip-generate"], {
      stdio: "pipe",
      cwd: "/home/z/my-project",
      env: { ...process.env, DATABASE_URL: `file:${TEST_DB_PATH}` },
    });
    let err = "";
    proc.stderr.on("data", (c) => { err += c.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`prisma db push exited ${code}: ${err.slice(-500)}`));
    });
  });

  prisma = new PrismaClient({
    datasources: { db: { url: `file:${TEST_DB_PATH}` } },
  });
  await prisma.$connect();
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
 * Tear down: disconnect Prisma, delete test DB.
 */
export async function teardownTestDb(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
  try { await fs.unlink(TEST_DB_PATH); } catch { /* ignore */ }
  try { await fs.unlink(TEST_DB_PATH + "-journal"); } catch { /* ignore */ }
}

/**
 * Get the current test Prisma client (must call setupTestDb first).
 */
export function getTestDb(): PrismaClient {
  if (!prisma) throw new Error("Call setupTestDb() first");
  return prisma;
}
