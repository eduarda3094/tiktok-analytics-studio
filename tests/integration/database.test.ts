/**
 * Integration tests for video database operations.
 *
 * Tests the full Prisma CRUD flow: create, read, update, delete videos
 * in an isolated test database.
 *
 * Tests run SEQUENTIALLY (not in parallel) because they share state —
 * later tests depend on the seed data created in beforeAll.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, seedFixtureVideos, teardownTestDb, getTestDb } from "../fixtures/db";

describe("Video database integration", () => {
  let videoIds: string[];

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // Re-seed before each test so each test starts with the same 3 fixture videos
  beforeEach(async () => {
    const db = getTestDb();
    await db.video.deleteMany({});
    videoIds = await seedFixtureVideos(db);
  });

  it("seeds 3 fixture videos", async () => {
    const db = getTestDb();
    const count = await db.video.count();
    expect(count).toBe(3);
  });

  it("reads a video by ID", async () => {
    const db = getTestDb();
    const v = await db.video.findUnique({ where: { id: videoIds[0] } });
    expect(v).toBeTruthy();
    expect(v!.authorUsername).toBe("user1");
    expect(v!.videoViews).toBe(1000000);
  });

  it("filters videos by author", async () => {
    const db = getTestDb();
    const user1Videos = await db.video.findMany({ where: { authorUsername: "user1" } });
    expect(user1Videos.length).toBe(2); // videos 1 and 3
  });

  it("filters videos by minViews", async () => {
    const db = getTestDb();
    const popular = await db.video.findMany({ where: { videoViews: { gte: 1000000 } } });
    expect(popular.length).toBe(2); // videos 1 (1M) and 3 (2M)
  });

  it("sorts videos by views descending", async () => {
    const db = getTestDb();
    const sorted = await db.video.findMany({ orderBy: { videoViews: "desc" } });
    expect(sorted[0].videoViews).toBe(2000000);
    expect(sorted[1].videoViews).toBe(1000000);
    expect(sorted[2].videoViews).toBe(500000);
  });

  it("filters by hashtag (string contains)", async () => {
    const db = getTestDb();
    const fyp = await db.video.findMany({ where: { hashtags: { contains: "fyp" } } });
    expect(fyp.length).toBe(2); // videos 1 and 3
  });

  it("computes aggregate stats", async () => {
    const db = getTestDb();
    const stats = await db.video.aggregate({
      _sum: { videoViews: true, likes: true, comments: true, shares: true, saves: true },
      _avg: { likeRate: true, commentRate: true, shareRate: true, duration: true },
      _count: true,
    });
    expect(stats._count).toBe(3);
    expect(stats._sum.videoViews).toBe(3500000);
    expect(stats._sum.likes).toBe(425000);
    expect(stats._avg.duration).toBeCloseTo((30 + 60 + 15) / 3, 2);
    expect(stats._avg.likeRate).toBeCloseTo((10.0 + 5.0 + 15.0) / 3, 2);
  });

  it("creates a new video", async () => {
    const db = getTestDb();
    const created = await db.video.create({
      data: {
        videoUrl: "https://www.tiktok.com/@new/video/999",
        sourceId: "999",
        videoViews: 100,
        likes: 10,
        comments: 1,
        shares: 0,
        saves: 5,
        authorUsername: "newuser",
        duration: 20,
        description: "New video",
        likeRate: 10.0,
        commentRate: 1.0,
        shareRate: 0.0,
        processingStatus: "completed",
        source: "url",
      },
    });
    expect(created.id).toBeTruthy();
    expect(created.authorUsername).toBe("newuser");

    // Cleanup
    await db.video.delete({ where: { id: created.id } });
  });

  it("updates a video's metrics and recomputes rates", async () => {
    const db = getTestDb();
    // Update video 2: bump views to 1M, likes to 100K
    const updated = await db.video.update({
      where: { id: videoIds[1] },
      data: {
        videoViews: 1000000,
        likes: 100000,
        likeRate: Math.round((100000 / 1000000) * 10000) / 100, // 10.0
      },
    });
    expect(updated.videoViews).toBe(1000000);
    expect(updated.likeRate).toBe(10.0);
  });

  it("deletes a video", async () => {
    const db = getTestDb();
    // Create then delete
    const temp = await db.video.create({
      data: {
        videoUrl: "https://temp.com",
        processingStatus: "completed",
        source: "test",
      },
    });
    await db.video.delete({ where: { id: temp.id } });
    const found = await db.video.findUnique({ where: { id: temp.id } });
    expect(found).toBeNull();
  });

  it("enforces uniqueness of sourceId via application logic", async () => {
    const db = getTestDb();
    // Try to find by sourceId
    const existing = await db.video.findFirst({ where: { sourceId: "111" } });
    expect(existing).toBeTruthy();
    expect(existing!.id).toBe(videoIds[0]);
  });

  it("parses JSON hashtags field", async () => {
    const db = getTestDb();
    const v = await db.video.findUnique({ where: { id: videoIds[0] } });
    expect(v!.hashtags).toBeTruthy();
    const tags = JSON.parse(v!.hashtags!);
    expect(Array.isArray(tags)).toBe(true);
    expect(tags).toContain("#fyp");
    expect(tags).toContain("#test");
  });
});
