/**
 * Unit tests for tiktok.ts fetchTikTokMetadata function.
 *
 * Mocks the Playwright scraper and oEmbed fetch to test the fallback logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the tiktok-scraper module
vi.mock("@/lib/tiktok-scraper", () => ({
  scrapeTikTokVideo: vi.fn(),
  itemStructToRecord: vi.fn((item: Record<string, unknown>, url: string) => {
    const r: Record<string, unknown> = {
      videoUrl: url,
      source: "url",
    };
    const stats = item.stats as Record<string, number> | undefined;
    if (stats) {
      r.videoViews = stats.playCount;
      r.likes = stats.diggCount;
      r.comments = stats.commentCount;
      r.shares = stats.shareCount;
      r.saves = stats.collectCount;
    }
    const video = item.video as Record<string, unknown> | undefined;
    if (video) {
      r.duration = video.duration;
      if (typeof video.playAddr === "string") r._playAddr = video.playAddr;
      if (video.downloadAddr) r._downloadAddr = video.downloadAddr;
    }
    const author = item.author as Record<string, unknown> | undefined;
    if (author) r.authorUsername = author.uniqueId;
    const music = item.music as Record<string, unknown> | undefined;
    if (music) r.soundName = music.title;
    if (item.desc) r.description = item.desc;
    if (item.createTime) r.publishDate = new Date((item.createTime as number) * 1000);
    const textExtra = item.textExtra as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(textExtra)) {
      const tags: string[] = [];
      for (const t of textExtra) {
        if (t.hashtagName) tags.push(`#${t.hashtagName}`);
      }
      if (tags.length) r.hashtags = tags;
    }
    r.rawMetadata = { itemStruct: item };
    return r;
  }),
}));

describe("fetchTikTokMetadata", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("uses scraped data when Playwright succeeds", async () => {
    const { scrapeTikTokVideo } = await import("@/lib/tiktok-scraper");
    const mocked = vi.mocked(scrapeTikTokVideo);
    mocked.mockResolvedValueOnce({
      ok: true,
      source: "universal",
      itemStruct: {
        stats: { playCount: 1000000, diggCount: 50000 },
        author: { uniqueId: "testuser" },
        video: { duration: 30 },
        music: { title: "Song" },
        desc: "Test description",
        createTime: 1720000000,
        textExtra: [{ hashtagName: "fyp" }],
      },
    });

    const { fetchTikTokMetadata } = await import("@/lib/tiktok");
    const result = await fetchTikTokMetadata("https://www.tiktok.com/@testuser/video/123");

    expect(result.videoViews).toBe(1000000);
    expect(result.likes).toBe(50000);
    expect(result.authorUsername).toBe("testuser");
    expect(result.duration).toBe(30);
    expect(result.soundName).toBe("Song");
    expect(result.description).toBe("Test description");
    expect(result.publishDate).toEqual(new Date(1720000000 * 1000));
    expect(result.hashtags).toEqual(["#fyp"]);
  });

  it("falls back to oEmbed when Playwright fails", async () => {
    const { scrapeTikTokVideo } = await import("@/lib/tiktok-scraper");
    const mocked = vi.mocked(scrapeTikTokVideo);
    mocked.mockResolvedValueOnce({
      ok: false,
      source: "none",
      error: "Geo-blocked",
    });

    // Mock oEmbed fetch
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({
        title: "Video title from oEmbed",
        author_name: "Test User",
        author_unique_id: "testuser",
        thumbnail_url: "https://example.com/thumb.jpg",
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    ) as typeof globalThis.fetch;

    const { fetchTikTokMetadata } = await import("@/lib/tiktok");
    const result = await fetchTikTokMetadata("https://www.tiktok.com/@testuser/video/456");

    expect(result.authorUsername).toBe("testuser");
    expect(result.description).toBe("Video title from oEmbed");
    // videoViews should NOT be set from oEmbed (it doesn't provide it)
    expect(result.videoViews).toBeUndefined();
  });

  it("handles geo-block by setting rawMetadata", async () => {
    const { scrapeTikTokVideo } = await import("@/lib/tiktok-scraper");
    const mocked = vi.mocked(scrapeTikTokVideo);
    mocked.mockResolvedValueOnce({
      ok: false,
      source: "none",
      geoBlocked: true,
      error: "TikTok bloqueou esta região",
    });

    // Mock oEmbed to also fail
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("network error")) as typeof globalThis.fetch;

    const { fetchTikTokMetadata } = await import("@/lib/tiktok");
    const result = await fetchTikTokMetadata("https://www.tiktok.com/@user/video/789");

    expect(result.rawMetadata).toHaveProperty("geoBlocked", true);
    expect(result.rawMetadata).toHaveProperty("scrapeError");
  });

  it("extracts sourceId from URL", async () => {
    const { scrapeTikTokVideo } = await import("@/lib/tiktok-scraper");
    const mocked = vi.mocked(scrapeTikTokVideo);
    mocked.mockResolvedValueOnce({
      ok: false,
      source: "none",
      error: "failed",
    });

    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("fail")) as typeof globalThis.fetch;

    const { fetchTikTokMetadata } = await import("@/lib/tiktok");
    const result = await fetchTikTokMetadata("https://www.tiktok.com/@user/video/987654321");

    expect(result.sourceId).toBe("987654321");
  });

  it("extracts authorUsername from URL", async () => {
    const { scrapeTikTokVideo } = await import("@/lib/tiktok-scraper");
    const mocked = vi.mocked(scrapeTikTokVideo);
    mocked.mockResolvedValueOnce({
      ok: false,
      source: "none",
      error: "failed",
    });

    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("fail")) as typeof globalThis.fetch;

    const { fetchTikTokMetadata } = await import("@/lib/tiktok");
    const result = await fetchTikTokMetadata("https://www.tiktok.com/@myuser/video/123");

    expect(result.authorUsername).toBe("myuser");
  });

  it("handles both scraper and oEmbed failing", async () => {
    const { scrapeTikTokVideo } = await import("@/lib/tiktok-scraper");
    const mocked = vi.mocked(scrapeTikTokVideo);
    mocked.mockResolvedValueOnce({
      ok: false,
      source: "none",
      error: "scraper failed",
    });

    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("oEmbed failed")) as typeof globalThis.fetch;

    const { fetchTikTokMetadata } = await import("@/lib/tiktok");
    const result = await fetchTikTokMetadata("https://www.tiktok.com/@user/video/123");

    // Should still return a basic record with the URL
    expect(result.videoUrl).toBe("https://www.tiktok.com/@user/video/123");
    expect(result.source).toBe("url");
    expect(result.sourceId).toBe("123");
  });
});
