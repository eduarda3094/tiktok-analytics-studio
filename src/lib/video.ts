/**
 * Video processing utilities for uploaded files.
 * Extracts metadata via ffprobe, saves the file to /home/z/my-project/storage/videos.
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";

const STORAGE_DIR = "/home/z/my-project/storage/videos";

export async function ensureStorageDir(): Promise<string> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  return STORAGE_DIR;
}

export interface VideoMeta {
  duration: number; // seconds
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  codec: string;
  format: string;
  sizeBytes: number;
}

/**
 * Run ffprobe on a file and extract video metadata.
 */
export async function probeVideo(filePath: string): Promise<VideoMeta> {
  const json = await new Promise<string>((resolve, reject) => {
    const args = [
      "-v", "error",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath,
    ];
    const proc = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    proc.stdout.on("data", (c) => { out += c.toString(); });
    proc.stderr.on("data", (c) => { err += c.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`ffprobe exited ${code}: ${err.slice(-500)}`));
    });
  });

  const data = JSON.parse(json);
  const videoStream = (data.streams || []).find((s: { codec_type: string }) => s.codec_type === "video");
  const fmt = data.format || {};

  let fps = 0;
  if (videoStream?.r_frame_rate) {
    const [n, d] = videoStream.r_frame_rate.split("/").map(Number);
    if (d && !isNaN(n)) fps = n / d;
  }

  return {
    duration: parseFloat(fmt.duration) || (videoStream?.duration ? parseFloat(videoStream.duration) : 0),
    width: videoStream?.width || 0,
    height: videoStream?.height || 0,
    fps,
    bitrate: parseInt(fmt.bit_rate) || 0,
    codec: videoStream?.codec_name || "unknown",
    format: (fmt.format_name || "").split(",")[0] || "unknown",
    sizeBytes: parseInt(fmt.size) || 0,
  };
}

export async function saveUploadedFile(
  fileBuffer: Buffer,
  originalName: string
): Promise<{ filePath: string; fileName: string }> {
  await ensureStorageDir();
  const ext = path.extname(originalName) || ".mp4";
  const safeName = `${Date.now()}-${originalName.replace(/[^a-zA-Z0-9._-]/g, "_")}${ext}`;
  const filePath = path.join(STORAGE_DIR, safeName);
  await fs.writeFile(filePath, fileBuffer);
  return { filePath, fileName: safeName };
}

/**
 * Download a video from a URL to local storage.
 * Returns the local file path.
 */
export async function downloadVideo(url: string): Promise<{ filePath: string; fileName: string }> {
  await ensureStorageDir();
  const res = await fetch(url, {
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Download falhou: ${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = url.match(/\.(mp4|mov|webm|m4v|avi)(\?|$)/i)?.[1]?.toLowerCase() ?? "mp4";
  const safeName = `${Date.now()}-downloaded.${ext}`;
  const filePath = path.join(STORAGE_DIR, safeName);
  await fs.writeFile(filePath, buffer);
  return { filePath, fileName: safeName };
}
