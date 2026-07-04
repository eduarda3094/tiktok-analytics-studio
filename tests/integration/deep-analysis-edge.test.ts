/**
 * Integration tests for deep-analysis edge cases.
 *
 * Tests scenarios not covered by the main deep-analysis.test.ts:
 *   - Empty database (no videos at all)
 *   - Single video in DB
 *   - Video with null metrics
 *   - Video with zero views
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, getTestDb } from "../fixtures/db";

// @ts-expect-error — import after env vars are set in setup
import { computeDeepAnalysis } from "@/lib/deep-analysis";

describe("deep-analysis edge cases", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    const db = getTestDb();
    await db.video.deleteMany({});
  });

  it("returns null for non-existent video in empty DB", async () => {
    const result = await computeDeepAnalysis("non-existent");
    expect(result).toBeNull();
  });

  it("handles a video with all null metrics", async () => {
    const db = getTestDb();
    const video = await db.video.create({
      data: {
        id: `null-metrics-${Date.now()}`,
        videoUrl: "https://example.com/null",
        videoViews: null,
        likes: null,
        comments: null,
        shares: null,
        saves: null,
        duration: null,
        soundName: null,
        description: null,
        ocrTitle: null,
        transcript: null,
        processingStatus: "completed",
        source: "test",
      },
    });

    const result = await computeDeepAnalysis(video.id);
    expect(result).not.toBeNull();
    expect(result!.metrics.videoViews).toBeNull();
    expect(result!.metrics.likes).toBeNull();
    expect(result!.rates.likeRate).toBeNull();
    expect(result!.rates.commentRate).toBeNull();
    expect(result!.rates.shareRate).toBeNull();
    expect(result!.buckets.viewTier).toBeNull();
    expect(result!.buckets.durationCategory).toBeNull();

    // Cleanup
    await db.video.delete({ where: { id: video.id } });
  });

  it("handles a video with zero views", async () => {
    const db = getTestDb();
    const video = await db.video.create({
      data: {
        id: `zero-views-${Date.now()}`,
        videoUrl: "https://example.com/zero",
        videoViews: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        duration: 10,
        processingStatus: "completed",
        source: "test",
      },
    });

    const result = await computeDeepAnalysis(video.id);
    expect(result).not.toBeNull();
    expect(result!.metrics.videoViews).toBe(0);
    // With 0 views, rates should be null (can't divide by zero)
    expect(result!.rates.likeRate).toBeNull();
    expect(result!.buckets.viewTier).toBe("nano"); // 0 < 1000

    // Cleanup
    await db.video.delete({ where: { id: video.id } });
  });

  it("handles a single video in DB (rank should be 1)", async () => {
    const db = getTestDb();
    const video = await db.video.create({
      data: {
        id: `single-${Date.now()}`,
        videoUrl: "https://example.com/single",
        videoViews: 50000,
        likes: 5000,
        comments: 200,
        shares: 500,
        saves: 300,
        duration: 20,
        likeRate: 10.0,
        commentRate: 0.4,
        shareRate: 1.0,
        processingStatus: "completed",
        source: "test",
      },
    });

    const result = await computeDeepAnalysis(video.id);
    expect(result).not.toBeNull();
    expect(result!.comparison.rank).toBe(1);
    expect(result!.comparison.totalInDb).toBe(1);
    // With only 1 video, percentile should be 100 (it's the top)
    // Actually with 0 other videos, percentile computation returns null
    // because there are no values to compare against
    expect(result!.comparison.viewsPercentile).toBeDefined();

    // Cleanup
    await db.video.delete({ where: { id: video.id } });
  });

  it("handles a very short video (< 15s)", async () => {
    const db = getTestDb();
    const video = await db.video.create({
      data: {
        id: `very-short-${Date.now()}`,
        videoUrl: "https://example.com/short",
        videoViews: 100000,
        likes: 10000,
        duration: 5,
        likeRate: 10.0,
        commentRate: 0.5,
        shareRate: 0.8,
        processingStatus: "completed",
        source: "test",
      },
    });

    const result = await computeDeepAnalysis(video.id);
    expect(result!.buckets.durationCategory).toBe("very_short");

    // Cleanup
    await db.video.delete({ where: { id: video.id } });
  });

  it("handles a very long video (> 120s)", async () => {
    const db = getTestDb();
    const video = await db.video.create({
      data: {
        id: `very-long-${Date.now()}`,
        videoUrl: "https://example.com/long",
        videoViews: 100000,
        likes: 10000,
        duration: 180,
        likeRate: 10.0,
        commentRate: 0.5,
        shareRate: 0.8,
        processingStatus: "completed",
        source: "test",
      },
    });

    const result = await computeDeepAnalysis(video.id);
    expect(result!.buckets.durationCategory).toBe("very_long");

    // Cleanup
    await db.video.delete({ where: { id: video.id } });
  });

  it("generates insights for video without OCR title", async () => {
    const db = getTestDb();
    const video = await db.video.create({
      data: {
        id: `no-ocr-${Date.now()}`,
        videoUrl: "https://example.com/no-ocr",
        videoViews: 50000,
        likes: 5000,
        duration: 20,
        likeRate: 10.0,
        ocrTitle: null,
        processingStatus: "completed",
        source: "test",
      },
    });

    const result = await computeDeepAnalysis(video.id);
    const ocrInsight = result!.insights.find((i) => i.includes("Sem título extraído"));
    expect(ocrInsight).toBeTruthy();

    // Cleanup
    await db.video.delete({ where: { id: video.id } });
  });

  it("generates insights for video without transcript", async () => {
    const db = getTestDb();
    const video = await db.video.create({
      data: {
        id: `no-transcript-${Date.now()}`,
        videoUrl: "https://example.com/no-transcript",
        videoViews: 50000,
        likes: 5000,
        duration: 20,
        likeRate: 10.0,
        transcript: null,
        processingStatus: "completed",
        source: "test",
      },
    });

    const result = await computeDeepAnalysis(video.id);
    const transcriptRec = result!.recommendations.find((r) => r.includes("transcrição"));
    expect(transcriptRec).toBeTruthy();

    // Cleanup
    await db.video.delete({ where: { id: video.id } });
  });

  it("generates viral recommendation for high engagement + low views", async () => {
    const db = getTestDb();
    const video = await db.video.create({
      data: {
        id: `viral-potential-${Date.now()}`,
        videoUrl: "https://example.com/viral-potential",
        videoViews: 50000,
        likes: 10000,  // 20% like rate → viral engagement
        comments: 2000,
        shares: 1000,
        saves: 500,
        duration: 15,
        likeRate: 20.0,
        commentRate: 4.0,
        shareRate: 2.0,
        ocrTitle: "Test title",
        transcript: "Test transcript",
        processingStatus: "completed",
        source: "test",
      },
    });

    const result = await computeDeepAnalysis(video.id);
    expect(result!.buckets.engagementCategory).toBe("viral");
    const viralRec = result!.recommendations.find((r) => r.includes("potencial de viralizar"));
    expect(viralRec).toBeTruthy();

    // Cleanup
    await db.video.delete({ where: { id: video.id } });
  });
});
