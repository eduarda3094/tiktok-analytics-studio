/**
 * Integration tests for deep-analysis module (src/lib/deep-analysis.ts)
 *
 * Uses an isolated SQLite test database with fixture data.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, seedFixtureVideos, teardownTestDb, getTestDb } from "../fixtures/db";

// @ts-expect-error — import after env vars are set in setup
import { computeDeepAnalysis } from "@/lib/deep-analysis";

describe("deep-analysis integration", () => {
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

  it("returns null for non-existent video ID", async () => {
    const result = await computeDeepAnalysis("non-existent-id");
    expect(result).toBeNull();
  });

  it("computes deep analysis for a video", async () => {
    const result = await computeDeepAnalysis(videoIds[0]);
    expect(result).not.toBeNull();
    expect(result!.videoId).toBe(videoIds[0]);
    expect(result!.author).toBe("user1");
  });

  it("extracts raw metrics correctly", async () => {
    const result = await computeDeepAnalysis(videoIds[0]);
    expect(result!.metrics.videoViews).toBe(1000000);
    expect(result!.metrics.likes).toBe(100000);
    expect(result!.metrics.comments).toBe(5000);
    expect(result!.metrics.shares).toBe(8000);
    expect(result!.metrics.saves).toBe(15000);
    expect(result!.metrics.duration).toBe(30);
  });

  it("computes rates from stored values", async () => {
    const result = await computeDeepAnalysis(videoIds[0]);
    // likeRate = 100000 / 1000000 * 100 = 10%
    expect(result!.rates.likeRate).toBe(10.0);
    // commentRate = 5000 / 1000000 * 100 = 0.5%
    expect(result!.rates.commentRate).toBe(0.5);
    // shareRate = 8000 / 1000000 * 100 = 0.8%
    expect(result!.rates.shareRate).toBe(0.8);
  });

  it("categorizes videos into buckets", async () => {
    // Video 1: 30s duration, 1M views
    // categorizeViews: 1M is NOT < 1M, so it's "mega"
    // categorizeDuration: 30 is NOT < 30, so it's "medium"
    const r1 = await computeDeepAnalysis(videoIds[0]);
    expect(r1!.buckets.durationCategory).toBe("medium");
    expect(r1!.buckets.viewTier).toBe("mega"); // 1M views = mega (not < 1M)

    // Video 2: 60s duration, 500K views
    const r2 = await computeDeepAnalysis(videoIds[1]);
    expect(r2!.buckets.durationCategory).toBe("long"); // 60s = long (not < 60)
    expect(r2!.buckets.viewTier).toBe("macro"); // 500K = macro (< 1M)

    // Video 3: 15s duration, 2M views, engagement = 19% (viral)
    const r3 = await computeDeepAnalysis(videoIds[2]);
    expect(r3!.buckets.durationCategory).toBe("short"); // 15 < 30 = short
    expect(r3!.buckets.viewTier).toBe("mega"); // 2M = mega
    expect(r3!.buckets.engagementCategory).toBe("viral"); // >10%
  });

  it("computes rank against the database", async () => {
    // Video 3 has the most views (2M), should be rank 1
    const r3 = await computeDeepAnalysis(videoIds[2]);
    expect(r3!.comparison.rank).toBe(1);
    expect(r3!.comparison.totalInDb).toBe(3);

    // Video 1 has 1M views, rank 2
    const r1 = await computeDeepAnalysis(videoIds[0]);
    expect(r1!.comparison.rank).toBe(2);

    // Video 2 has 500K views, rank 3
    const r2 = await computeDeepAnalysis(videoIds[1]);
    expect(r2!.comparison.rank).toBe(3);
  });

  it("computes percentiles", async () => {
    // Video 3 has the most views, percentile should be 100 (top of 3 videos)
    const r3 = await computeDeepAnalysis(videoIds[2]);
    expect(r3!.comparison.viewsPercentile).toBeGreaterThan(95);

    // Video 2 has the fewest views, percentile should be low
    const r2 = await computeDeepAnalysis(videoIds[1]);
    expect(r2!.comparison.viewsPercentile).toBeLessThan(20);
  });

  it("generates insights", async () => {
    const r = await computeDeepAnalysis(videoIds[0]);
    expect(r!.insights).toBeInstanceOf(Array);
    expect(r!.insights.length).toBeGreaterThan(0);

    // Should mention views count
    const viewsInsight = r!.insights.find((i) => i.includes("1.000.000"));
    expect(viewsInsight).toBeTruthy();

    // Should mention like rate (insight text starts with "Taxa de likes:")
    const likeInsight = r!.insights.find((i) => i.includes("Taxa de likes"));
    expect(likeInsight).toBeTruthy();
  });

  it("generates recommendations", async () => {
    const r = await computeDeepAnalysis(videoIds[0]);
    expect(r!.recommendations).toBeInstanceOf(Array);
    expect(r!.recommendations.length).toBeGreaterThan(0);
  });

  it("handles video without OCR title", async () => {
    // Video 2 has ocrTitle = null
    const r = await computeDeepAnalysis(videoIds[1]);
    const ocrInsight = r!.insights.find((i) => i.includes("Sem título extraído"));
    expect(ocrInsight).toBeTruthy();
  });

  it("includes transcript info when available", async () => {
    const r = await computeDeepAnalysis(videoIds[0]);
    const transcriptInsight = r!.insights.find((i) => i.includes("Transcrição"));
    expect(transcriptInsight).toBeTruthy();
  });
});
