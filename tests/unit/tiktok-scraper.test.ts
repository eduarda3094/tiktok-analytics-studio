/**
 * Unit tests for tiktok-scraper.ts — itemStructToRecord function.
 *
 * This is a pure function that converts the raw TikTok itemStruct JSON
 * into our PartialVideoRecord. Tests cover all field extraction paths.
 */

import { describe, it, expect } from "vitest";
import { itemStructToRecord } from "@/lib/tiktok-scraper";

describe("itemStructToRecord", () => {
  const fallbackUrl = "https://www.tiktok.com/@user/video/123";

  it("returns a record with fallback URL and source 'url'", () => {
    const result = itemStructToRecord({}, fallbackUrl);
    expect(result.videoUrl).toBe(fallbackUrl);
    expect(result.source).toBe("url");
  });

  describe("stats extraction", () => {
    it("extracts playCount as videoViews", () => {
      const item = { stats: { playCount: 1000000 } };
      const result = itemStructToRecord(item, fallbackUrl);
      expect(result.videoViews).toBe(1000000);
    });

    it("extracts diggCount as likes", () => {
      const item = { stats: { diggCount: 50000 } };
      const result = itemStructToRecord(item, fallbackUrl);
      expect(result.likes).toBe(50000);
    });

    it("extracts commentCount as comments", () => {
      const item = { stats: { commentCount: 1200 } };
      const result = itemStructToRecord(item, fallbackUrl);
      expect(result.comments).toBe(1200);
    });

    it("extracts shareCount as shares", () => {
      const item = { stats: { shareCount: 3000 } };
      const result = itemStructToRecord(item, fallbackUrl);
      expect(result.shares).toBe(3000);
    });

    it("extracts collectCount as saves", () => {
      const item = { stats: { collectCount: 800 } };
      const result = itemStructToRecord(item, fallbackUrl);
      expect(result.saves).toBe(800);
    });

    it("handles missing stats object", () => {
      const result = itemStructToRecord({}, fallbackUrl);
      expect(result.videoViews).toBeUndefined();
      expect(result.likes).toBeUndefined();
      expect(result.comments).toBeUndefined();
    });
  });

  describe("video extraction", () => {
    it("extracts duration from video object", () => {
      const item = { video: { duration: 30 } };
      const result = itemStructToRecord(item, fallbackUrl);
      expect(result.duration).toBe(30);
    });

    it("extracts playAddr as _playAddr (string)", () => {
      const item = { video: { playAddr: "https://example.com/video.mp4" } };
      const result = itemStructToRecord(item, fallbackUrl) as Record<string, unknown>;
      expect(result._playAddr).toBe("https://example.com/video.mp4");
    });

    it("extracts playAddr as _playAddr (first element of array)", () => {
      const item = { video: { playAddr: ["https://example.com/v1.mp4", "https://example.com/v2.mp4"] } };
      const result = itemStructToRecord(item, fallbackUrl) as Record<string, unknown>;
      expect(result._playAddr).toBe("https://example.com/v1.mp4");
    });

    it("extracts downloadAddr as _downloadAddr", () => {
      const item = { video: { downloadAddr: "https://example.com/download.mp4" } };
      const result = itemStructToRecord(item, fallbackUrl) as Record<string, unknown>;
      expect(result._downloadAddr).toBe("https://example.com/download.mp4");
    });

    it("handles empty playAddr array", () => {
      const item = { video: { playAddr: [] } };
      const result = itemStructToRecord(item, fallbackUrl) as Record<string, unknown>;
      expect(result._playAddr).toBeUndefined();
    });

    it("handles missing video object", () => {
      const result = itemStructToRecord({}, fallbackUrl);
      expect(result.duration).toBeUndefined();
    });
  });

  describe("author extraction", () => {
    it("extracts uniqueId as authorUsername", () => {
      const item = { author: { uniqueId: "tiktokuser" } };
      const result = itemStructToRecord(item, fallbackUrl);
      expect(result.authorUsername).toBe("tiktokuser");
    });

    it("handles missing author object", () => {
      const result = itemStructToRecord({}, fallbackUrl);
      expect(result.authorUsername).toBeUndefined();
    });
  });

  describe("music extraction", () => {
    it("extracts title as soundName", () => {
      const item = { music: { title: "Original Sound - User" } };
      const result = itemStructToRecord(item, fallbackUrl);
      expect(result.soundName).toBe("Original Sound - User");
    });

    it("handles missing music object", () => {
      const result = itemStructToRecord({}, fallbackUrl);
      expect(result.soundName).toBeUndefined();
    });
  });

  describe("description extraction", () => {
    it("extracts desc as description", () => {
      const item = { desc: "Check out this video! #fyp" };
      const result = itemStructToRecord(item, fallbackUrl);
      expect(result.description).toBe("Check out this video! #fyp");
    });

    it("handles missing desc", () => {
      const result = itemStructToRecord({}, fallbackUrl);
      expect(result.description).toBeUndefined();
    });
  });

  describe("publishDate extraction", () => {
    it("converts createTime (Unix seconds) to Date", () => {
      const item = { createTime: 1718445600 }; // 2024-06-15T10:00:00Z
      const result = itemStructToRecord(item, fallbackUrl);
      expect(result.publishDate).toEqual(new Date(1718445600 * 1000));
    });

    it("handles missing createTime", () => {
      const result = itemStructToRecord({}, fallbackUrl);
      expect(result.publishDate).toBeUndefined();
    });
  });

  describe("hashtags extraction from textExtra", () => {
    it("extracts hashtags from textExtra array", () => {
      const item = {
        textExtra: [
          { hashtagName: "fyp" },
          { hashtagName: "viral" },
          { hashtagName: "tutorial" },
        ],
      };
      const result = itemStructToRecord(item, fallbackUrl);
      expect(result.hashtags).toEqual(["#fyp", "#viral", "#tutorial"]);
    });

    it("formats hashtags with # prefix", () => {
      const item = { textExtra: [{ hashtagName: "test" }] };
      const result = itemStructToRecord(item, fallbackUrl);
      expect(result.hashtags?.[0]).toBe("#test");
    });

    it("handles textExtra without hashtagName entries", () => {
      const item = { textExtra: [{ secUid: "abc", userId: "123" }] };
      const result = itemStructToRecord(item, fallbackUrl);
      expect(result.hashtags).toBeUndefined();
    });

    it("handles empty textExtra array", () => {
      const item = { textExtra: [] };
      const result = itemStructToRecord(item, fallbackUrl);
      expect(result.hashtags).toBeUndefined();
    });

    it("handles missing textExtra", () => {
      const result = itemStructToRecord({}, fallbackUrl);
      expect(result.hashtags).toBeUndefined();
    });
  });

  describe("rawMetadata", () => {
    it("preserves the original itemStruct in rawMetadata", () => {
      const item = { stats: { playCount: 100 }, desc: "test" };
      const result = itemStructToRecord(item, fallbackUrl);
      expect(result.rawMetadata).toEqual({ itemStruct: item });
    });
  });

  describe("full itemStruct integration", () => {
    it("extracts all fields from a complete itemStruct", () => {
      const item = {
        stats: {
          playCount: 5000000,
          diggCount: 300000,
          commentCount: 8000,
          shareCount: 15000,
          collectCount: 22000,
        },
        video: {
          duration: 45,
          playAddr: "https://example.com/play.mp4",
          downloadAddr: "https://example.com/download.mp4",
        },
        author: { uniqueId: "creator" },
        music: { title: "Trending Sound" },
        desc: "Amazing video description #fyp #viral",
        createTime: 1720000000,
        textExtra: [
          { hashtagName: "fyp" },
          { hashtagName: "viral" },
        ],
      };
      const result = itemStructToRecord(item, fallbackUrl);
      expect(result.videoViews).toBe(5000000);
      expect(result.likes).toBe(300000);
      expect(result.comments).toBe(8000);
      expect(result.shares).toBe(15000);
      expect(result.saves).toBe(22000);
      expect(result.duration).toBe(45);
      expect(result.authorUsername).toBe("creator");
      expect(result.soundName).toBe("Trending Sound");
      expect(result.description).toBe("Amazing video description #fyp #viral");
      expect(result.publishDate).toEqual(new Date(1720000000 * 1000));
      expect(result.hashtags).toEqual(["#fyp", "#viral"]);
      expect((result as Record<string, unknown>)._playAddr).toBe("https://example.com/play.mp4");
      expect((result as Record<string, unknown>)._downloadAddr).toBe("https://example.com/download.mp4");
    });
  });
});
