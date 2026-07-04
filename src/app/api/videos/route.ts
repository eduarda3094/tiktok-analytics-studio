import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchTikTokMetadata, normalizeJsonToRecord, type PartialVideoRecord } from "@/lib/tiktok";
import { saveUploadedFile, downloadVideo } from "@/lib/video";
import { ocrTitleFromVideo } from "@/lib/ocr";
import { transcribeVideo } from "@/lib/transcribe";
import { promises as fs } from "fs";

function parseJsonFields(v: Record<string, unknown>) {
  const out = { ...v };
  for (const key of ["hashtags", "rawMetadata"]) {
    const val = out[key];
    if (typeof val === "string" && val.length > 0) {
      try { out[key] = JSON.parse(val as string); } catch { /* keep string */ }
    } else if (val == null || val === "") {
      out[key] = key === "rawMetadata" ? null : [];
    }
  }
  return out;
}

/**
 * Compute likeRate, commentRate, shareRate from raw metrics.
 */
function computeRates(r: PartialVideoRecord): void {
  const v = r.videoViews;
  if (v != null && v > 0) {
    r.likeRate = r.likes != null ? Math.round((r.likes / v) * 10000) / 100 : (undefined as never);
    r.commentRate = r.comments != null ? Math.round((r.comments / v) * 10000) / 100 : (undefined as never);
    r.shareRate = r.shares != null ? Math.round((r.shares / v) * 10000) / 100 : (undefined as never);
  }
}

// Helper type augmentation: PartialVideoRecord doesn't have likeRate/commentRate/shareRate
// because those are computed fields not part of the source data.
type RecordWithRates = PartialVideoRecord & {
  likeRate?: number;
  commentRate?: number;
  shareRate?: number;
};

/**
 * GET /api/videos
 * Query params: q, author, minViews, maxViews, minLikes, minDuration, maxDuration,
 *               hashtag, startDate, endDate, sortBy, sortDir, limit, offset, status
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const params = url.searchParams;

  const where: Record<string, unknown> = {};
  const AND: Record<string, unknown>[] = [];

  const q = params.get("q")?.trim();
  if (q) {
    AND.push({
      OR: [
        { description: { contains: q } },
        { authorUsername: { contains: q } },
        { ocrTitle: { contains: q } },
        { transcript: { contains: q } },
        { soundName: { contains: q } },
      ],
    });
  }

  const author = params.get("author")?.trim();
  if (author) where.authorUsername = author;

  const minViews = params.get("minViews");
  if (minViews) AND.push({ videoViews: { gte: parseInt(minViews) } });
  const maxViews = params.get("maxViews");
  if (maxViews) AND.push({ videoViews: { lte: parseInt(maxViews) } });
  const minLikes = params.get("minLikes");
  if (minLikes) AND.push({ likes: { gte: parseInt(minLikes) } });
  const minDuration = params.get("minDuration");
  if (minDuration) AND.push({ duration: { gte: parseInt(minDuration) } });
  const maxDuration = params.get("maxDuration");
  if (maxDuration) AND.push({ duration: { lte: parseInt(maxDuration) } });

  const hashtag = params.get("hashtag")?.trim();
  if (hashtag) AND.push({ hashtags: { contains: hashtag } });

  const startDate = params.get("startDate");
  if (startDate) AND.push({ publishDate: { gte: new Date(startDate) } });
  const endDate = params.get("endDate");
  if (endDate) AND.push({ publishDate: { lte: new Date(endDate) } });

  const status = params.get("status");
  if (status) where.processingStatus = status;

  if (AND.length > 0) where.AND = AND;

  const sortBy = params.get("sortBy") || "publishDate";
  const sortDir = params.get("sortDir") === "asc" ? "asc" : "desc";
  const orderBy: Record<string, "asc" | "desc"> = { [sortBy]: sortDir };

  const limit = Math.min(parseInt(params.get("limit") || "100"), 500);
  const offset = parseInt(params.get("offset") || "0");

  const [videos, total] = await Promise.all([
    db.video.findMany({ where, orderBy, take: limit, skip: offset }),
    db.video.count({ where }),
  ]);

  const stats = await db.video.aggregate({
    _sum: { videoViews: true, likes: true, comments: true, shares: true, saves: true },
    _avg: { duration: true, likeRate: true, commentRate: true, shareRate: true },
    _count: true,
  });

  return NextResponse.json({
    videos: videos.map(parseJsonFields),
    total,
    limit,
    offset,
    stats: {
      count: stats._count,
      totalViews: stats._sum.videoViews ?? 0,
      totalLikes: stats._sum.likes ?? 0,
      totalComments: stats._sum.comments ?? 0,
      totalShares: stats._sum.shares ?? 0,
      totalSaves: stats._sum.saves ?? 0,
      avgDuration: stats._avg.duration ?? 0,
      avgLikeRate: stats._avg.likeRate ?? 0,
      avgCommentRate: stats._avg.commentRate ?? 0,
      avgShareRate: stats._avg.shareRate ?? 0,
    },
  });
}

/**
 * POST /api/videos
 * Body: { url?, json?, file?(multipart), runOcr?, runTranscribe?, skipDownload?, extra? }
 *
 * Pipeline:
 *   1. Get metadata (from scraping URL, JSON, or uploaded file)
 *   2. Download .mp4 if available (for OCR + transcription)
 *   3. Run OCR on frame at second 2 → extract title
 *   4. Run audio transcription → get transcript
 *   5. Save video record to database (only the fields the user wants)
 *   6. DELETE the .mp4 and the OCR screenshot (kept only what's in the DB)
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let body: Record<string, unknown>;
    let uploadedFile: { buffer: Buffer; name: string } | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (file instanceof File) {
        uploadedFile = {
          buffer: Buffer.from(await file.arrayBuffer()),
          name: file.name,
        };
      }
      body = {};
      for (const [k, v] of form.entries()) {
        if (k === "file") continue;
        body[k] = typeof v === "string" ? v : v;
      }
      if (typeof body.json === "string" && body.json.trim()) {
        try { body.json = JSON.parse(body.json as string); } catch { /* keep */ }
      }
      if (typeof body.extra === "string" && body.extra.trim()) {
        try { body.extra = JSON.parse(body.extra as string); } catch { /* keep */ }
      }
      if (typeof body.runOcr === "string") body.runOcr = body.runOcr === "true";
      if (typeof body.runTranscribe === "string") body.runTranscribe = body.runTranscribe === "true";
    } else {
      body = await req.json();
    }

    const url = (body.url as string) || "";
    const jsonMeta = body.json as Record<string, unknown> | undefined;
    const extra = (body.extra as Record<string, unknown>) || {};
    const runOcr = body.runOcr !== false;
    const runTranscribe = body.runTranscribe !== false;
    const skipDownload = body.skipDownload === true;

    let record: RecordWithRates;
    let localVideoPath: string | null = null;

    if (uploadedFile) {
      // Uploaded file — save temporarily to run OCR + transcription
      const { filePath, fileName } = await saveUploadedFile(uploadedFile.buffer, uploadedFile.name);
      localVideoPath = filePath;
      record = {
        videoUrl: `(upload) ${uploadedFile.name}`,
        source: "upload",
      } as RecordWithRates;
    } else if (jsonMeta) {
      record = normalizeJsonToRecord(jsonMeta, url) as RecordWithRates;
    } else if (url) {
      if (url.includes("tiktok.com")) {
        record = (await fetchTikTokMetadata(url)) as RecordWithRates;
      } else {
        record = { videoUrl: url, source: "url" } as RecordWithRates;
      }
    } else {
      return NextResponse.json({ error: "Forneça 'url', 'json' ou 'file'." }, { status: 400 });
    }

    // Apply manual overrides from `extra`
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== null && v !== "") {
        (record as Record<string, unknown>)[k] = v;
      }
    }

    // Download the .mp4 if available (for OCR + transcription)
    if (!localVideoPath && !skipDownload) {
      const videoDownloadUrl =
        (record as Record<string, unknown>)._playAddr as string | undefined ||
        (record as Record<string, unknown>)._downloadAddr as string | undefined;
      if (videoDownloadUrl) {
        try {
          const { filePath } = await downloadVideo(videoDownloadUrl);
          localVideoPath = filePath;
        } catch (err) {
          console.warn("Download failed:", err);
        }
      } else if (url && !url.includes("tiktok.com")) {
        try {
          const { filePath } = await downloadVideo(url);
          localVideoPath = filePath;
        } catch (err) {
          console.warn("Download failed:", err);
        }
      }
    }

    // Compute rates
    computeRates(record as PartialVideoRecord);

    // Persist initial record (status=processing)
    const created = await db.video.create({
      data: {
        sourceId: record.sourceId ?? null,
        videoUrl: record.videoUrl,
        videoViews: record.videoViews ?? null,
        likes: record.likes ?? null,
        comments: record.comments ?? null,
        shares: record.shares ?? null,
        saves: record.saves ?? null,
        authorUsername: record.authorUsername ?? null,
        duration: record.duration ?? null,
        soundName: record.soundName ?? null,
        description: record.description ?? null,
        hashtags: record.hashtags ? JSON.stringify(record.hashtags) : null,
        publishDate: record.publishDate ?? null,
        likeRate: (record as RecordWithRates).likeRate ?? null,
        commentRate: (record as RecordWithRates).commentRate ?? null,
        shareRate: (record as RecordWithRates).shareRate ?? null,
        source: record.source,
        rawMetadata: record.rawMetadata ? JSON.stringify(record.rawMetadata) : null,
        processingStatus: "processing",
      },
    });

    // Run OCR + transcription — always when we have a local .mp4
    const updates: Record<string, unknown> = {};
    const errors: string[] = [];

    if (localVideoPath) {
      // OCR — frame at second 2 only
      if (runOcr) {
        try {
          const ocrResult = await ocrTitleFromVideo(localVideoPath, { second: 2, lang: "por+eng" });
          updates.ocrTitle = ocrResult.cleanedText || null;
          updates.ocrConfidence = ocrResult.confidence;
          if (!ocrResult.cleanedText) {
            errors.push("OCR: nenhum texto no frame do segundo 2 (vídeo pode não ter título escrito)");
          }
        } catch (err) {
          errors.push(`OCR: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Transcription — NIM Parakeet first, Whisper fallback
      if (runTranscribe) {
        const t = await transcribeVideo(localVideoPath);
        updates.transcript = t.text || null;
        updates.transcriptEngine = t.engine;
        if (!t.text) {
          errors.push(`Transcrição: ${t.error || t.note || "sem texto extraído"}`);
        }
      }

      // DELETE the .mp4 — we only keep what's in the database
      try {
        await fs.unlink(localVideoPath);
      } catch {
        // ignore
      }
    } else if (runOcr || runTranscribe) {
      errors.push("OCR/Transcrição pulados: sem arquivo .mp4 local disponível");
    }

    // Mark as completed — even if OCR/transcription had issues, the video itself is in the DB.
    updates.processingStatus = "completed";
    if (errors.length > 0) updates.processingError = errors.join(" | ");

    const updated = await db.video.update({
      where: { id: created.id },
      data: updates,
    });

    return NextResponse.json({ video: parseJsonFields(updated as unknown as Record<string, unknown>) }, { status: 201 });
  } catch (err) {
    console.error("POST /api/videos error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
