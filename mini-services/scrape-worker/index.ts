/**
 * Background worker that polls the database for pending ScrapeJobs and processes them.
 *
 * For each URL in the job, the worker:
 *   1. Scrapes the TikTok page (Playwright) → gets public metrics
 *   2. Downloads the .mp4 (if playAddr/downloadAddr available)
 *   3. Runs OCR on frame at 2s → extracts title
 *   4. Runs audio transcription → gets transcript
 *   5. Inserts/updates the video in the database (only the fields the user wants)
 *   6. DELETES the .mp4 (we only keep what's in the DB)
 *
 * The worker is decoupled from the Next.js server. Even if the user closes the browser,
 * the worker keeps running. Progress is visible via /api/jobs/[id].
 *
 * Polling: every 5 seconds.
 */

import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const db = new PrismaClient();
const POLL_INTERVAL_MS = 5000;
const PORT = 3031;

let currentJob: { id: string; status: string; total: number; completed: number } | null = null;

async function main() {
  console.log(`[scrape-worker] started on port ${PORT}, polling every ${POLL_INTERVAL_MS}ms`);

  Bun.serve({
    port: PORT,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/health') {
        return Response.json({ ok: true, ts: Date.now() });
      }
      if (url.pathname === '/stats') {
        return Response.json({
          running: currentJob?.id ?? null,
          status: currentJob?.status ?? 'idle',
          progress: currentJob ? `${currentJob.completed}/${currentJob.total}` : '0/0',
        });
      }
      return new Response('not found', { status: 404 });
    },
  });

  while (true) {
    try {
      const job = await db.scrapeJob.findFirst({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
      });
      if (job) {
        console.log(`[scrape-worker] picked up job ${job.id} (${job.type})`);
        await processJob(job);
      }
    } catch (err) {
      console.error('[scrape-worker] poll error:', err);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function processJob(job: any) {
  currentJob = { id: job.id, status: 'processing', total: 0, completed: 0 };
  await db.scrapeJob.update({
    where: { id: job.id },
    data: { status: 'processing', startedAt: new Date() },
  });

  try {
    let urls: string[] = JSON.parse(job.urls || '[]');
    const errors: Array<{ url: string; error: string }> = [];
    const videoIds: string[] = [];

    // If account scrape, first discover all video URLs
    if (job.type === 'account' && job.username) {
      console.log(`[scrape-worker] discovering videos for @${job.username}`);
      await db.scrapeJob.update({
        where: { id: job.id },
        data: { status: 'processing', error: `Descobrindo vídeos de @${job.username}...` },
      });

      const { scrapeTikTokAccount } = await import('../../src/lib/tiktok-account-scraper');
      const accountResult = await scrapeTikTokAccount(job.username);

      if (!accountResult.ok) {
        await db.scrapeJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            error: accountResult.error || 'Falha ao descobrir vídeos da conta',
            finishedAt: new Date(),
          },
        });
        currentJob = null;
        return;
      }

      urls = accountResult.videoUrls;
      // Save the itemStructs in a temp file keyed by job ID (for reuse)
      const itemStructs = new Map<string, Record<string, unknown>>();
      for (const v of accountResult.videos) {
        const id = (v.id as string) || (v.aweme_id as string);
        if (id) itemStructs.set(id, v);
      }
      const tmpFile = path.join(os.tmpdir(), `job-${job.id}-items.json`);
      await fs.writeFile(tmpFile, JSON.stringify(Object.fromEntries(itemStructs)));
      console.log(`[scrape-worker] discovered ${urls.length} videos for @${job.username}`);
    }

    const total = urls.length;
    await db.scrapeJob.update({
      where: { id: job.id },
      data: { total, error: null },
    });
    currentJob = { id: job.id, status: 'processing', total, completed: 0 };

    // Process each URL sequentially
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`[scrape-worker] [${i + 1}/${total}] processing ${url}`);
      try {
        await db.scrapeJob.update({
          where: { id: job.id },
          data: { error: `Processando ${i + 1}/${total}: ${url.slice(0, 80)}` },
        });
        const videoId = await processOneVideo(url, job);
        if (videoId) videoIds.push(videoId);

        await db.scrapeJob.update({
          where: { id: job.id },
          data: { completed: { increment: 1 } },
        });
        currentJob!.completed++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push({ url, error: errMsg });
        console.error(`[scrape-worker] error on ${url}:`, errMsg);
        await db.scrapeJob.update({
          where: { id: job.id },
          data: { failed: { increment: 1 } },
        });
      }
    }

    // Cleanup temp file
    try {
      await fs.unlink(path.join(os.tmpdir(), `job-${job.id}-items.json`));
    } catch { /* ignore */ }

    const finalStatus = errors.length === 0 ? 'completed' : errors.length === total ? 'failed' : 'partial';
    await db.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: finalStatus,
        videoIds: JSON.stringify(videoIds),
        errors: JSON.stringify(errors),
        error: null,
        finishedAt: new Date(),
      },
    });
    console.log(`[scrape-worker] job ${job.id} done: ${videoIds.length} ok, ${errors.length} failed`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[scrape-worker] job ${job.id} fatal error:`, errMsg);
    await db.scrapeJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: errMsg, finishedAt: new Date() },
    });
  } finally {
    currentJob = null;
  }
}

/**
 * Process one video URL: scrape → download .mp4 → OCR → transcribe → save → DELETE .mp4.
 * Returns the video ID.
 */
async function processOneVideo(url: string, job: any): Promise<string | null> {
  // Check if we already have the itemStruct cached (account scrape case)
  let itemStruct: Record<string, unknown> | undefined;
  try {
    const tmpFile = path.join(os.tmpdir(), `job-${job.id}-items.json`);
    const txt = await fs.readFile(tmpFile, 'utf8');
    const map = JSON.parse(txt);
    const vid = url.match(/video\/(\d+)/)?.[1];
    if (vid && map[vid]) itemStruct = map[vid];
  } catch { /* ignore */ }

  // If not cached, scrape it
  if (!itemStruct) {
    const { scrapeTikTokVideo } = await import('../../src/lib/tiktok-scraper');
    const result = await scrapeTikTokVideo(url);
    if (!result.ok || !result.itemStruct) {
      throw new Error(result.error || 'Não foi possível extrair o vídeo');
    }
    itemStruct = result.itemStruct;
  }

  // Normalize to record
  const { itemStructToRecord } = await import('../../src/lib/tiktok-scraper');
  const record: any = itemStructToRecord(itemStruct, url);

  // Compute rates
  const v = record.videoViews;
  if (v != null && v > 0) {
    if (record.likes != null) record.likeRate = Math.round((record.likes / v) * 10000) / 100;
    if (record.comments != null) record.commentRate = Math.round((record.comments / v) * 10000) / 100;
    if (record.shares != null) record.shareRate = Math.round((record.shares / v) * 10000) / 100;
  }

  // Check if video already exists (by sourceId)
  const existing = record.sourceId ? await db.video.findFirst({ where: { sourceId: record.sourceId } }) : null;

  // Try to download the .mp4
  let localVideoPath: string | null = null;
  const playAddr = record._playAddr;
  const downloadAddr = record._downloadAddr;
  const videoDownloadUrl = playAddr || downloadAddr;
  if (videoDownloadUrl) {
    try {
      const { downloadVideo } = await import('../../src/lib/video');
      const { filePath } = await downloadVideo(videoDownloadUrl);
      localVideoPath = filePath;
    } catch (err) {
      console.warn('Download failed:', err);
    }
  }

  // Run OCR — frame at second 2 only
  let ocrTitle: string | null = null;
  let ocrConfidence: number | null = null;
  const procErrors: string[] = [];

  if (localVideoPath) {
    try {
      const { ocrTitleFromVideo } = await import('../../src/lib/ocr');
      const ocr = await ocrTitleFromVideo(localVideoPath, { second: 2, lang: 'por+eng' });
      ocrTitle = ocr.cleanedText || null;
      ocrConfidence = ocr.confidence;
      if (!ocrTitle) {
        procErrors.push('OCR: nenhum texto no frame do segundo 2 (vídeo pode não ter título escrito)');
      }
    } catch (err) {
      procErrors.push(`OCR: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    procErrors.push('OCR pulado: sem arquivo .mp4 local');
  }

  // Run transcription
  let transcript: string | null = null;
  let transcriptEngine: string | null = null;

  if (localVideoPath) {
    try {
      const { transcribeVideo } = await import('../../src/lib/transcribe');
      const t = await transcribeVideo(localVideoPath);
      transcript = t.text || null;
      transcriptEngine = t.engine;
      if (!transcript) {
        procErrors.push(`Transcrição: ${t.error || t.note || 'sem texto extraído'}`);
      }
    } catch (err) {
      procErrors.push(`Transcrição: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    procErrors.push('Transcrição pulada: sem arquivo .mp4 local');
  }

  // DELETE the .mp4 — we only keep what's in the database
  if (localVideoPath) {
    try {
      await fs.unlink(localVideoPath);
    } catch {
      // ignore
    }
  }

  // Save or update the video — only the fields we care about
  const data: any = {
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
    ocrTitle,
    ocrConfidence,
    transcript,
    transcriptEngine,
    likeRate: record.likeRate ?? null,
    commentRate: record.commentRate ?? null,
    shareRate: record.shareRate ?? null,
    processingStatus: 'completed',
    processingError: procErrors.length > 0 ? procErrors.join(' | ') : null,
    source: 'url',
    rawMetadata: record.rawMetadata ? JSON.stringify(record.rawMetadata) : null,
  };

  if (existing) {
    await db.video.update({ where: { id: existing.id }, data });
    return existing.id;
  } else {
    data.sourceId = record.sourceId ?? null;
    const created = await db.video.create({ data });
    return created.id;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error('[scrape-worker] fatal:', err);
  process.exit(1);
});
