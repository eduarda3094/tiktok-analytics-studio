/**
 * Unit tests for TikTok normalizer (src/lib/tiktok.ts)
 *
 * Tests extraction of TikTok IDs/usernames from URLs and JSON normalization
 * (no network calls — these test pure functions).
 */

import { describe, it, expect } from "vitest";
import {
  extractTikTokId,
  extractTikTokUsername,
  normalizeJsonToRecord,
} from "@/lib/tiktok";

describe("extractTikTokId", () => {
  it("extracts ID from canonical desktop URL", () => {
    expect(extractTikTokId("https://www.tiktok.com/@tiktok/video/7106594312292453675"))
      .toBe("7106594312292453675");
  });

  it("extracts ID from URL without @ in path", () => {
    expect(extractTikTokId("https://www.tiktok.com/someotherpath/video/1234567890"))
      .toBe("1234567890");
  });

  it("extracts ID from /v/ short URL", () => {
    expect(extractTikTokId("https://www.tiktok.com/v/99999999"))
      .toBe("99999999");
  });

  it("returns null for non-TikTok URL", () => {
    expect(extractTikTokId("https://www.youtube.com/watch?v=123"))
      .toBeNull();
  });

  it("returns null for TikTok profile URL without video ID", () => {
    expect(extractTikTokId("https://www.tiktok.com/@tiktok"))
      .toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractTikTokId("")).toBeNull();
  });

  it("returns null for malformed URL", () => {
    expect(extractTikTokId("not a url at all")).toBeNull();
  });

  it("handles mobile URLs", () => {
    expect(extractTikTokId("https://m.tiktok.com/v/12345.html"))
      .toBe("12345");
  });
});

describe("extractTikTokUsername", () => {
  it("extracts username from canonical URL", () => {
    expect(extractTikTokUsername("https://www.tiktok.com/@tiktok/video/123"))
      .toBe("tiktok");
  });

  it("extracts username from profile URL", () => {
    expect(extractTikTokUsername("https://www.tiktok.com/@someuser"))
      .toBe("someuser");
  });

  it("returns null for URL without @", () => {
    expect(extractTikTokUsername("https://www.tiktok.com/somepath/video/123"))
      .toBeNull();
  });

  it("returns null for non-TikTok URL", () => {
    expect(extractTikTokUsername("https://www.youtube.com/@user"))
      .toBeNull();
  });

  it("handles usernames with dots and underscores", () => {
    expect(extractTikTokUsername("https://www.tiktok.com/@user.name_123/video/456"))
      .toBe("user.name_123");
  });
});

describe("normalizeJsonToRecord", () => {
  it("normalizes flat top-level fields (canonical names)", () => {
    const json = {
      videoUrl: "https://www.tiktok.com/@user/video/1",
      videoViews: 1000,
      likes: 100,
      comments: 10,
      shares: 5,
      saves: 3,
      authorUsername: "user",
      duration: 30,
      soundName: "Cool Song",
      description: "My video",
      hashtags: ["#fyp", "#viral"],
      publishDate: "2025-06-15T10:00:00Z",
    };
    const r = normalizeJsonToRecord(json);
    expect(r.videoUrl).toBe("https://www.tiktok.com/@user/video/1");
    expect(r.videoViews).toBe(1000);
    expect(r.likes).toBe(100);
    expect(r.comments).toBe(10);
    expect(r.shares).toBe(5);
    expect(r.saves).toBe(3);
    expect(r.authorUsername).toBe("user");
    expect(r.duration).toBe(30);
    expect(r.soundName).toBe("Cool Song");
    expect(r.description).toBe("My video");
    expect(r.hashtags).toEqual(["#fyp", "#viral"]);
    expect(r.publishDate).toEqual(new Date("2025-06-15T10:00:00Z"));
    expect(r.source).toBe("json");
  });

  it("accepts legacy aliases (views, plays, diggs)", () => {
    const json = {
      videoUrl: "https://example.com",
      views: 5000,
      plays: 5000,
      diggs: 500,
    };
    const r = normalizeJsonToRecord(json);
    expect(r.videoViews).toBe(5000);
  });

  it("accepts nested author object", () => {
    const json = {
      videoUrl: "https://example.com",
      author: { username: "nested_user", uniqueId: "nested_user_id" },
    };
    const r = normalizeJsonToRecord(json);
    expect(r.authorUsername).toBe("nested_user");
  });

  it("accepts nested creator object", () => {
    const json = {
      videoUrl: "https://example.com",
      creator: { uniqueId: "creator_id" },
    };
    const r = normalizeJsonToRecord(json);
    expect(r.authorUsername).toBe("creator_id");
  });

  it("accepts nested stats object (TikTok Research API format)", () => {
    const json = {
      videoUrl: "https://example.com",
      stats: {
        playCount: 100000,
        diggCount: 5000,
        commentCount: 200,
        shareCount: 100,
        collectCount: 50,
      },
    };
    const r = normalizeJsonToRecord(json);
    expect(r.videoViews).toBe(100000);
    expect(r.likes).toBe(5000);
    expect(r.comments).toBe(200);
    expect(r.shares).toBe(100);
    expect(r.saves).toBe(50);
  });

  it("accepts nested music object", () => {
    const json = {
      videoUrl: "https://example.com",
      music: { title: "Song from music object" },
    };
    const r = normalizeJsonToRecord(json);
    expect(r.soundName).toBe("Song from music object");
  });

  it("accepts nested sound object", () => {
    const json = {
      videoUrl: "https://example.com",
      sound: { name: "Sound name" },
    };
    const r = normalizeJsonToRecord(json);
    expect(r.soundName).toBe("Sound name");
  });

  it("accepts nested video object for duration", () => {
    const json = {
      videoUrl: "https://example.com",
      video: { duration: 45 },
    };
    const r = normalizeJsonToRecord(json);
    expect(r.duration).toBe(45);
  });

  it("accepts desc as description alias", () => {
    const json = {
      videoUrl: "https://example.com",
      desc: "TikTok caption",
    };
    const r = normalizeJsonToRecord(json);
    expect(r.description).toBe("TikTok caption");
  });

  it("accepts caption as description alias", () => {
    const json = {
      videoUrl: "https://example.com",
      caption: "Another caption",
    };
    const r = normalizeJsonToRecord(json);
    expect(r.description).toBe("Another caption");
  });

  it("accepts Unix timestamp as publishDate (seconds)", () => {
    const json = {
      videoUrl: "https://example.com",
      createTime: 1718445600, // 2024-06-15T10:00:00Z
    };
    const r = normalizeJsonToRecord(json);
    expect(r.publishDate).toBeInstanceOf(Date);
    expect(r.publishDate?.getTime()).toBe(1718445600 * 1000);
  });

  it("accepts Unix timestamp in milliseconds as publishDate", () => {
    const json = {
      videoUrl: "https://example.com",
      publishDate: 1718445600000,
    };
    const r = normalizeJsonToRecord(json);
    expect(r.publishDate).toEqual(new Date(1718445600000));
  });

  it("accepts ISO string as publishDate", () => {
    const json = {
      videoUrl: "https://example.com",
      publishDate: "2025-06-15T10:00:00.000Z",
    };
    const r = normalizeJsonToRecord(json);
    expect(r.publishDate).toEqual(new Date("2025-06-15T10:00:00.000Z"));
  });

  it("ignores invalid publishDate", () => {
    const json = {
      videoUrl: "https://example.com",
      publishDate: "not-a-date",
    };
    const r = normalizeJsonToRecord(json);
    expect(r.publishDate).toBeUndefined();
  });

  it("accepts tags as hashtags alias", () => {
    const json = {
      videoUrl: "https://example.com",
      tags: ["#tag1", "#tag2"],
    };
    const r = normalizeJsonToRecord(json);
    expect(r.hashtags).toEqual(["#tag1", "#tag2"]);
  });

  it("uses fallback URL when videoUrl not provided", () => {
    const r = normalizeJsonToRecord({}, "https://fallback.example.com");
    expect(r.videoUrl).toBe("https://fallback.example.com");
  });

  it("preserves rawMetadata with the original JSON", () => {
    const json = { videoUrl: "https://example.com", customField: "abc" };
    const r = normalizeJsonToRecord(json);
    expect(r.rawMetadata).toEqual(json);
  });

  it("handles empty object", () => {
    const r = normalizeJsonToRecord({}, "");
    expect(r.videoUrl).toBe("");
    expect(r.videoViews).toBeUndefined();
    expect(r.likes).toBeUndefined();
    expect(r.source).toBe("json");
  });

  it("prefers canonical name over legacy alias", () => {
    const json = {
      videoUrl: "https://example.com",
      videoViews: 1000,
      views: 500, // should be ignored
    };
    const r = normalizeJsonToRecord(json);
    expect(r.videoViews).toBe(1000);
  });

  it("prefers flat top-level over nested object", () => {
    const json = {
      videoUrl: "https://example.com",
      authorUsername: "flat_user",
      author: { username: "nested_user" }, // should be ignored
    };
    const r = normalizeJsonToRecord(json);
    expect(r.authorUsername).toBe("flat_user");
  });
});
