/**
 * Unit tests for video utilities (src/lib/video.ts)
 *
 * Tests ffprobe output parsing and metadata extraction.
 * Uses mocked spawn so no real ffprobe runs.
 */

import { describe, it, expect, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";

vi.mock("child_process", () => ({
  spawn: vi.fn((cmd: string, args: string[]) => {
    const { EventEmitter } = require("events");
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

import { probeVideo, saveUploadedFile, ensureStorageDir } from "@/lib/video";

describe("video utilities", () => {
  describe("probeVideo", () => {
    it("extracts metadata from ffprobe JSON output", async () => {
      const meta = await probeVideo("/fake/video.mp4");
      expect(meta.duration).toBe(30.5);
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1920);
      expect(meta.fps).toBe(30);
      expect(meta.bitrate).toBe(2500000);
      expect(meta.sizeBytes).toBe(9570312);
      expect(meta.codec).toBe("h264");
      expect(meta.format).toBe("mov");
    });
  });

  describe("ensureStorageDir", () => {
    it("creates the storage directory if it doesn't exist", async () => {
      const dir = await ensureStorageDir();
      const stat = await fs.stat(dir);
      expect(stat.isDirectory()).toBe(true);
    });

    it("returns the same path on subsequent calls", async () => {
      const dir1 = await ensureStorageDir();
      const dir2 = await ensureStorageDir();
      expect(dir1).toBe(dir2);
    });
  });

  describe("saveUploadedFile", () => {
    it("saves a buffer to the storage directory", async () => {
      const buffer = Buffer.from("test-content");
      const result = await saveUploadedFile(buffer, "test.mp4");
      const stat = await fs.stat(result.filePath);
      expect(stat.isFile()).toBe(true);
      expect(result.fileName).toMatch(/test\.mp4/);
      // Cleanup
      await fs.unlink(result.filePath).catch(() => {});
    });

    it("preserves the original filename in the saved name", async () => {
      const buffer = Buffer.from("test");
      const result = await saveUploadedFile(buffer, "myvideo.mp4");
      expect(result.fileName).toContain("myvideo.mp4");
      // Cleanup
      await fs.unlink(result.filePath).catch(() => {});
    });

    it("adds .mp4 extension if missing", async () => {
      const buffer = Buffer.from("test");
      const result = await saveUploadedFile(buffer, "noextension");
      expect(result.fileName).toMatch(/\.mp4$/);
      // Cleanup
      await fs.unlink(result.filePath).catch(() => {});
    });

    it("saves files in the storage directory", async () => {
      const buffer = Buffer.from("test");
      const result = await saveUploadedFile(buffer, "pathtest.mp4");
      expect(result.filePath).toMatch(/storage\/videos\//);
      // Cleanup
      await fs.unlink(result.filePath).catch(() => {});
    });
  });
});
