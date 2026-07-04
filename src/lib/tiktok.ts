/**
 * TikTok metadata fetcher — simplificado.
 *
 * Extrai APENAS os campos pedidos:
 *   - videoViews, likes, comments, shares, saves
 *   - authorUsername
 *   - duration, soundName, description, hashtags, publishDate
 *
 * Usa Playwright (navegador real) para extrair o JSON embutido da página
 * (__UNIVERSAL_DATA_FOR_REHYDRATION__). Cai pra oEmbed se Playwright falhar.
 */

export interface PartialVideoRecord {
  // Identificação
  sourceId?: string;
  videoUrl: string;
  // Métricas
  videoViews?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  // Autor
  authorUsername?: string;
  // Vídeo
  duration?: number;
  soundName?: string;
  description?: string;
  hashtags?: string[];
  publishDate?: Date;
  // Campos privados usados internamente (não persistidos no banco)
  _playAddr?: string;
  _downloadAddr?: string;
  rawMetadata?: unknown;
  source: "url" | "manual" | "json" | "api" | "upload";
}

/**
 * Extract TikTok video ID from a URL.
 */
export function extractTikTokId(url: string): string | null {
  const patterns = [
    /tiktok\.com\/.*\/video\/(\d+)/i,
    /tiktok\.com\/@[\w.-]+\/video\/(\d+)/i,
    /tiktok\.com\/v\/(\d+)/i,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function extractTikTokUsername(url: string): string | null {
  const m = url.match(/tiktok\.com\/@([\w.-]+)/i);
  return m ? m[1] : null;
}

/**
 * Fetch metadata for a TikTok URL via Playwright (real browser).
 * Falls back to oEmbed if Playwright fails.
 */
export async function fetchTikTokMetadata(url: string): Promise<PartialVideoRecord> {
  const record: PartialVideoRecord = {
    videoUrl: url,
    source: "url",
  };

  record.sourceId = extractTikTokId(url) ?? undefined;
  record.authorUsername = extractTikTokUsername(url) ?? undefined;

  // Strategy 1: Playwright scraper
  try {
    const { scrapeTikTokVideo, itemStructToRecord } = await import("./tiktok-scraper");
    const scraped = await scrapeTikTokVideo(url);
    if (scraped.ok && scraped.itemStruct) {
      const fromItem = itemStructToRecord(scraped.itemStruct, url);
      Object.assign(record, fromItem);
      record.rawMetadata = { scrapeSource: scraped.source };
      return record;
    }
    if (scraped.geoBlocked) {
      record.rawMetadata = { geoBlocked: true, scrapeError: scraped.error };
    }
  } catch (err) {
    console.warn("Playwright scrape failed, falling back to oEmbed:", err);
  }

  // Strategy 2: oEmbed fallback (basic: just username + thumbnail)
  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const oembedRes = await fetch(oembedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TikTokAnalyzer/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (oembedRes.ok) {
      const oembed = await oembedRes.json();
      record.authorUsername = oembed.author_unique_id ?? record.authorUsername;
      record.description = oembed.title ?? record.description;
      record.rawMetadata = { ...(record.rawMetadata as object), oembed };
    }
  } catch {
    // ignore
  }

  return record;
}

/**
 * Normalize an arbitrary JSON object (from manual paste) into a PartialVideoRecord.
 * Accepts both flat top-level fields and nested TikTok structures.
 */
export function normalizeJsonToRecord(
  json: Record<string, unknown>,
  fallbackUrl = ""
): PartialVideoRecord {
  const r: PartialVideoRecord = { videoUrl: fallbackUrl, source: "json" };
  const g = (k: string) => json[k];

  // Identification
  r.videoUrl = (g("videoUrl") as string) ?? (g("url") as string) ?? (g("share_url") as string) ?? fallbackUrl;
  r.sourceId = (g("id") as string) ?? (g("video_id") as string) ?? (g("sourceId") as string) ?? undefined;

  // Author
  r.authorUsername = (g("authorUsername") as string) ?? (g("author_username") as string) ?? undefined;
  if (!r.authorUsername) {
    const author = (g("author") as Record<string, unknown>) ?? (g("creator") as Record<string, unknown>);
    if (author) {
      r.authorUsername = (author.username as string) ?? (author.unique_id as string) ?? (author.uniqueId as string) ?? undefined;
    }
  }

  // Engagement metrics
  r.videoViews = (g("videoViews") as number) ?? (g("video_views") as number) ?? (g("views") as number) ?? (g("view_count") as number) ?? undefined;
  r.likes = (g("likes") as number) ?? (g("like_count") as number) ?? undefined;
  r.comments = (g("comments") as number) ?? (g("comment_count") as number) ?? undefined;
  r.shares = (g("shares") as number) ?? (g("share_count") as number) ?? undefined;
  r.saves = (g("saves") as number) ?? (g("save_count") as number) ?? (g("favorites") as number) ?? undefined;

  if (r.videoViews == null || r.likes == null) {
    const stats = (g("stats") as Record<string, number>) ?? (g("metrics") as Record<string, number>);
    if (stats) {
      r.videoViews = r.videoViews ?? (stats.playCount ?? stats.views ?? stats.view_count ?? stats.play_count);
      r.likes = r.likes ?? (stats.diggCount ?? stats.likes ?? stats.like_count ?? stats.digg_count);
      r.comments = r.comments ?? (stats.commentCount ?? stats.comments ?? stats.comment_count);
      r.shares = r.shares ?? (stats.shareCount ?? stats.shares ?? stats.share_count);
      r.saves = r.saves ?? (stats.collectCount ?? stats.saves ?? stats.collect_count);
    }
  }

  // Video
  r.duration = (g("duration") as number) ?? undefined;
  if (r.duration == null) {
    const video = g("video") as Record<string, unknown> | undefined;
    if (video) r.duration = (video.duration as number) ?? undefined;
  }

  // Sound
  r.soundName = (g("soundName") as string) ?? (g("sound_name") as string) ?? (g("musicTitle") as string) ?? undefined;
  if (!r.soundName) {
    const music = (g("music") as Record<string, unknown>) ?? (g("sound") as Record<string, unknown>);
    if (music) {
      r.soundName = (music.title as string) ?? (music.name as string) ?? undefined;
    }
  }

  // Description / caption
  r.description = (g("description") as string) ?? (g("desc") as string) ?? (g("caption") as string) ?? undefined;

  // Hashtags
  const tags = g("hashtags") ?? g("tags");
  if (Array.isArray(tags)) r.hashtags = tags.map(String);

  // Publish date
  const pd = g("publishDate") ?? g("publish_date") ?? g("createTime") ?? g("created_at") ?? g("date");
  if (pd) {
    const d = typeof pd === "number" ? new Date(pd < 1e12 ? pd * 1000 : pd) : new Date(pd as string);
    if (!isNaN(d.getTime())) r.publishDate = d;
  }

  r.rawMetadata = json;
  return r;
}
