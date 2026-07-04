/**
 * OCR module — extrai o frame do segundo 2 e roda tesseract.
 *
 * Regra simples:
 *   - Se o frame do segundo 2 tem texto → retorna o texto + confiança
 *   - Se o frame do segundo 2 não tem texto → retorna vazio (sem fallback)
 *
 * Usa o tesseract do sistema (/usr/bin/tesseract) com idioma por+eng.
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export interface OcrResult {
  text: string;
  confidence: number; // 0..100
  cleanedText: string;
}

/**
 * Extract a frame at the given timestamp from a video.
 * Returns the path to the temporary PNG file. Caller MUST delete it.
 */
export async function extractFrameAtSecond(
  videoPath: string,
  second: number = 2,
  outDir?: string
): Promise<string> {
  const tmpDir = outDir ?? await fs.mkdtemp(path.join(os.tmpdir(), "tiktok-frame-"));
  const outPath = path.join(tmpDir, `frame-${Date.now()}-${second}s.png`);

  await new Promise<void>((resolve, reject) => {
    const args = [
      "-y",
      "-ss", String(second),
      "-i", videoPath,
      "-frames:v", "1",
      "-q:v", "2",
      outPath,
    ];
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (c) => { stderr += c.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });

  return outPath;
}

/**
 * Run tesseract on the given image and return OCR text + confidence.
 * TSV output gives per-word confidence; we average it.
 *
 * Tries PSM 3 (default) first. If empty, tries PSM 7 (single line of text)
 * which works better for TikTok-style centered titles.
 * Same frame, just different tesseract page-segmentation modes.
 */
export async function runTesseract(imagePath: string, lang = "por+eng"): Promise<OcrResult> {
  // Try PSM 3 (default automatic page segmentation)
  let result = await runTesseractPsm(imagePath, lang, 3);
  if (result.cleanedText && result.confidence > 30) {
    return result;
  }
  // Fallback: PSM 7 (single line of text) — better for centered TikTok titles
  const result7 = await runTesseractPsm(imagePath, lang, 7);
  if (result7.cleanedText && (!result.cleanedText || result7.confidence > result.confidence)) {
    return result7;
  }
  // Fallback: PSM 11 (sparse text) — good for text scattered on the frame
  const result11 = await runTesseractPsm(imagePath, lang, 11);
  if (result11.cleanedText && (!result.cleanedText || result11.confidence > result.confidence)) {
    return result11;
  }
  return result;
}

async function runTesseractPsm(
  imagePath: string,
  lang: string,
  psm: number
): Promise<OcrResult> {
  const tsvOut = imagePath + ".tsv";

  await new Promise<void>((resolve, reject) => {
    const args = [imagePath, tsvOut.replace(/\.tsv$/, ""), "-l", lang, "--psm", String(psm), "tsv"];
    const proc = spawn("tesseract", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (c) => { stderr += c.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tesseract exited ${code}: ${stderr.slice(-500)}`));
    });
  });

  let tsv = "";
  try {
    tsv = await fs.readFile(tsvOut, "utf8");
  } finally {
    await fs.unlink(tsvOut).catch(() => {});
  }

  const lines = tsv.split("\n").filter(Boolean);
  if (lines.length === 0) {
    return { text: "", confidence: 0, cleanedText: "" };
  }
  const header = lines[0].split("\t");
  const confIdx = header.indexOf("conf");
  const textIdx = header.indexOf("text");
  if (confIdx === -1 || textIdx === -1) {
    return { text: "", confidence: 0, cleanedText: "" };
  }

  let totalConf = 0;
  let count = 0;
  const words: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const conf = parseFloat(cols[confIdx]);
    const text = cols[textIdx];
    if (!text || conf < 0) continue;
    totalConf += conf;
    count += 1;
    words.push(text);
  }

  const text = words.join(" ");
  const confidence = count > 0 ? totalConf / count : 0;
  const cleanedText = text.replace(/\s+/g, " ").trim();

  return { text, confidence, cleanedText };
}

/**
 * Full pipeline: extrai o frame no segundo 2, roda tesseract, deleta screenshot.
 * Se o frame do segundo 2 não tem texto, retorna vazio (sem fallback pra outros frames).
 *
 * @param videoPath Path to the local .mp4 file
 * @param options.second Segundo do frame (default 2 — não mudar)
 * @param options.lang Tesseract language (default "por+eng")
 */
export async function ocrTitleFromVideo(
  videoPath: string,
  options: { second?: number; lang?: string; persistDir?: string } = {}
): Promise<OcrResult> {
  const second = options.second ?? 2;
  const lang = options.lang ?? "por+eng";
  const framePath = await extractFrameAtSecond(videoPath, second);

  try {
    return await runTesseract(framePath, lang);
  } finally {
    if (options.persistDir) {
      try {
        await fs.mkdir(options.persistDir, { recursive: true });
        await fs.rename(framePath, path.join(options.persistDir, `frame-${second}s-${Date.now()}.png`));
      } catch {
        await fs.unlink(framePath).catch(() => {});
      }
    } else {
      await fs.unlink(framePath).catch(() => {});
    }
  }
}
