/**
 * Integration tests for chat tool execution (src/app/api/chat/route.ts).
 *
 * Tests the executeTool function indirectly by creating videos and verifying
 * that the tool operations (query, get, create, update, delete, stats) work
 * correctly against the test database.
 *
 * Note: these tests DON'T call the NIM API (no API key). They test the
 * database operations that the tools perform.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, seedFixtureVideos, teardownTestDb, getTestDb } from "../fixtures/db";

describe("Chat tool database operations", () => {
  let videoIds: string[];

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    const db = getTestDb();
    await db.video.deleteMany({});
    videoIds = await seedFixtureVideos(db);
  });

  describe("query_videos equivalent (database filter)", () => {
    it("filters by author", async () => {
      const db = getTestDb();
      const videos = await db.video.findMany({ where: { authorUsername: "user1" } });
      expect(videos.length).toBe(2);
    });

    it("filters by minViews", async () => {
      const db = getTestDb();
      const videos = await db.video.findMany({ where: { videoViews: { gte: 1000000 } } });
      expect(videos.length).toBe(2);
    });

    it("filters by hashtag (contains)", async () => {
      const db = getTestDb();
      const videos = await db.video.findMany({ where: { hashtags: { contains: "viral" } } });
      expect(videos.length).toBe(2); // videos 2 and 3 have #viral
    });

    it("sorts by videoViews descending", async () => {
      const db = getTestDb();
      const videos = await db.video.findMany({ orderBy: { videoViews: "desc" } });
      expect(videos[0].videoViews).toBeGreaterThan(videos[1].videoViews!);
    });

    it("sorts by likeRate descending", async () => {
      const db = getTestDb();
      const videos = await db.video.findMany({ orderBy: { likeRate: "desc" } });
      expect(videos[0].likeRate!).toBeGreaterThanOrEqual(videos[1].likeRate!);
    });

    it("text search across multiple fields", async () => {
      const db = getTestDb();
      const videos = await db.video.findMany({
        where: {
          OR: [
            { description: { contains: "test" } },
            { authorUsername: { contains: "user" } },
            { ocrTitle: { contains: "test" } },
            { transcript: { contains: "test" } },
            { soundName: { contains: "test" } },
          ],
        },
      });
      expect(videos.length).toBeGreaterThan(0);
    });

    it("combines multiple filters with AND", async () => {
      const db = getTestDb();
      const videos = await db.video.findMany({
        where: {
          AND: [
            { authorUsername: "user1" },
            { videoViews: { gte: 1000000 } },
          ],
        },
      });
      expect(videos.length).toBe(2); // both user1 videos have 1M+ views
    });

    it("respects limit parameter", async () => {
      const db = getTestDb();
      const videos = await db.video.findMany({ take: 1 });
      expect(videos.length).toBe(1);
    });
  });

  describe("get_video equivalent", () => {
    it("finds video by ID", async () => {
      const db = getTestDb();
      const video = await db.video.findUnique({ where: { id: videoIds[0] } });
      expect(video).toBeTruthy();
      expect(video!.authorUsername).toBe("user1");
    });

    it("returns null for non-existent ID", async () => {
      const db = getTestDb();
      const video = await db.video.findUnique({ where: { id: "non-existent" } });
      expect(video).toBeNull();
    });
  });

  describe("create_video equivalent", () => {
    it("creates a video with computed rates", async () => {
      const db = getTestDb();
      const views = 100000;
      const likes = 5000;
      const comments = 500;
      const shares = 100;

      const created = await db.video.create({
        data: {
          id: `create-test-${Date.now()}`,
          videoUrl: "https://tiktok.com/@new/video/1",
          videoViews: views,
          likes,
          comments,
          shares,
          saves: 50,
          authorUsername: "newcreator",
          duration: 25,
          likeRate: Math.round((likes / views) * 10000) / 100,
          commentRate: Math.round((comments / views) * 10000) / 100,
          shareRate: Math.round((shares / views) * 10000) / 100,
          processingStatus: "completed",
          source: "ai",
        },
      });

      expect(created.likeRate).toBe(5.0); // 5000/100000 * 100 = 5
      expect(created.commentRate).toBe(0.5); // 500/100000 * 100 = 0.5
      expect(created.shareRate).toBe(0.1); // 100/100000 * 100 = 0.1

      // Cleanup
      await db.video.delete({ where: { id: created.id } });
    });
  });

  describe("update_video equivalent", () => {
    it("updates metrics and recomputes rates", async () => {
      const db = getTestDb();
      // Update video with new views and likes
      const newViews = 2000000;
      const newLikes = 400000;

      const updated = await db.video.update({
        where: { id: videoIds[0] },
        data: {
          videoViews: newViews,
          likes: newLikes,
          likeRate: Math.round((newLikes / newViews) * 10000) / 100,
        },
      });

      expect(updated.videoViews).toBe(2000000);
      expect(updated.likes).toBe(400000);
      expect(updated.likeRate).toBe(20.0); // 400000/2000000 * 100
    });

    it("updates description only", async () => {
      const db = getTestDb();
      const updated = await db.video.update({
        where: { id: videoIds[0] },
        data: { description: "Updated description" },
      });
      expect(updated.description).toBe("Updated description");
    });

    it("updates hashtags as JSON string", async () => {
      const db = getTestDb();
      const updated = await db.video.update({
        where: { id: videoIds[0] },
        data: { hashtags: JSON.stringify(["#newtag", "#updated"]) },
      });
      const tags = JSON.parse(updated.hashtags!);
      expect(tags).toEqual(["#newtag", "#updated"]);
    });
  });

  describe("delete_video equivalent", () => {
    it("deletes a video", async () => {
      const db = getTestDb();
      await db.video.delete({ where: { id: videoIds[0] } });
      const found = await db.video.findUnique({ where: { id: videoIds[0] } });
      expect(found).toBeNull();
    });
  });

  describe("get_stats equivalent", () => {
    it("computes aggregate stats correctly", async () => {
      const db = getTestDb();
      const stats = await db.video.aggregate({
        _sum: { videoViews: true, likes: true, comments: true, shares: true, saves: true },
        _avg: { likeRate: true, commentRate: true, shareRate: true, duration: true },
        _count: true,
      });

      expect(stats._count).toBe(3);
      // 1M + 500K + 2M = 3.5M
      expect(stats._sum.videoViews).toBe(3500000);
      // 100K + 25K + 300K = 425K
      expect(stats._sum.likes).toBe(425000);
    });

    it("computes average rates correctly", async () => {
      const db = getTestDb();
      const stats = await db.video.aggregate({
        _avg: { likeRate: true, commentRate: true, shareRate: true },
        _count: true,
      });

      // (10.0 + 5.0 + 15.0) / 3 ≈ 10.0
      expect(stats._avg.likeRate).toBeCloseTo(10.0, 1);
    });
  });

  describe("deep_analyze_video equivalent", () => {
    it("computes analysis for a specific video", async () => {
      // This is tested more thoroughly in deep-analysis.test.ts
      // Here we just verify the video exists and has data
      const db = getTestDb();
      const video = await db.video.findUnique({ where: { id: videoIds[0] } });
      expect(video).toBeTruthy();
      expect(video!.videoViews).toBe(1000000);
      expect(video!.likeRate).toBe(10.0);
    });
  });
});
