/**
 * Integration tests for video.ts — downloadVideo and probeVideo
 * with real-ish behavior (using mocked spawn).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { EventEmitter } from "events";

vi.mock("child_process", () => ({
  spawn: vi.fn((cmd: string, args: string[]) => {
    const proc = new EventEmitter();
    (proc as any).stderr = new EventEmitter();
    (proc as any).stdout = new EventEmitter();

    if (cmd === "ffprobe") {
      setTimeout(() => {
        const json = JSON.stringify({
          streams: [{
            codec_type: "video",
            codec_name: "h264",
            width: 1080,
            height: 1920,
            duration: "30.5",
            r_frame_rate: "30/1",
          }],
          format: {
            duration: "30.5",
            bit_rate: "2500000",
            size: "9570312",
            format_name: "mov,mp4,m4a,3gp,3g2,mj2",
          },
        });
        (proc as any).stdout.emit("data", json);
        proc.emit("close", 0);
      }, 10);
    } else if (cmd === "ffmpeg") {
      setTimeout(async () => {
        const outPath = args[args.length - 1];
        await fs.mkdir(path.dirname(outPath), { recursive: true }).catch(() => {});
        await fs.writeFile(outPath, Buffer.from("fake-mp4"));
        proc.emit("close", 0);
      }, 10);
    }
    return proc;
  }),
}));

describe("video.ts additional tests", () => {
  describe("downloadVideo", () => {
    afterEach(async () => {
      // Clean up any downloaded files
      const storageDir = path.join(process.cwd(), "storage", "videos");
      try {
        const files = await fs.readdir(storageDir);
        for (const f of files) {
          if (f.includes("downloaded")) {
            await fs.unlink(path.join(storageDir, f)).catch(() => {});
          }
        }
      } catch { /* ignore */ }
    });

    it("downloads a video from a URL and saves to storage", async () => {
      const { downloadVideo } = await import("@/lib/video");

      // Mock global fetch
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(new Uint8Array([0, 1, 2, 3, 4, 5]), { status: 200 })
      ) as typeof globalThis.fetch;

      try {
        const result = await downloadVideo("https://example.com/video.mp4");
        expect(result.filePath).toMatch(/downloaded.*\.mp4$/);
        expect(result.fileName).toMatch(/downloaded.*\.mp4$/);

        // File should exist
        const stat = await fs.stat(result.filePath);
        expect(stat.size).toBeGreaterThan(0);

        // Cleanup
        await fs.unlink(result.filePath).catch(() => {});
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("detects file extension from URL", async () => {
      const { downloadVideo } = await import("@/lib/video");
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(new Uint8Array([0, 1, 2]), { status: 200 })
      ) as typeof globalThis.fetch;

      try {
        const result = await downloadVideo("https://example.com/video.mov?token=abc");
        expect(result.fileName).toMatch(/\.mov$/);
        await fs.unlink(result.filePath).catch(() => {});
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("defaults to .mp4 when URL has no recognizable extension", async () => {
      const { downloadVideo } = await import("@/lib/video");
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(new Uint8Array([0, 1, 2]), { status: 200 })
      ) as typeof globalThis.fetch;

      try {
        const result = await downloadVideo("https://example.com/no-extension");
        expect(result.fileName).toMatch(/\.mp4$/);
        await fs.unlink(result.filePath).catch(() => {});
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("throws on HTTP error", async () => {
      const { downloadVideo } = await import("@/lib/video");
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response("Not Found", { status: 404 })
      ) as typeof globalThis.fetch;

      try {
        await expect(downloadVideo("https://example.com/missing.mp4"))
          .rejects.toThrow(/Download falhou: 404/);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("throws on fetch network error", async () => {
      const { downloadVideo } = await import("@/lib/video");
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error")) as typeof globalThis.fetch;

      try {
        await expect(downloadVideo("https://example.com/error"))
          .rejects.toThrow();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("probeVideo", () => {
    it("parses video stream and format metadata", async () => {
      const { probeVideo } = await import("@/lib/video");
      const meta = await probeVideo("/fake/video.mp4");

      expect(meta.duration).toBe(30.5);
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1920);
      expect(meta.fps).toBe(30);
      expect(meta.bitrate).toBe(2500000);
      expect(meta.codec).toBe("h264");
      expect(meta.format).toBe("mov");
      expect(meta.sizeBytes).toBe(9570312);
    });

    it("calculates fps from r_frame_rate fraction", async () => {
      const { probeVideo } = await import("@/lib/video");
      // The mock returns r_frame_rate "30/1" → fps = 30
      const meta = await probeVideo("/fake/video.mp4");
      expect(meta.fps).toBe(30);
    });
  });
});
