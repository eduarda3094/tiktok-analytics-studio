/**
 * TikTok scraper using Playwright (real browser) — extracts the COMPLETE public JSON
 * via __UNIVERSAL_DATA_FOR_REHYDRATION__ or SIGI_STATE.
 *
 * This works for ANY public video: third-party OR your own. Same metrics everywhere.
 *
 * Metrics captured (all public TikTok fields):
 *   - stats: playCount (videoViews), diggCount (likes), commentCount, shareCount, collectCount (saves)
 *   - video: duration, width, height, ratio, definition, codec, bitrate, cover, dynamicCover, downloadAddr
 *   - author: id, uniqueId, nickname, verified, signature
 *   - authorStats: followerCount, followingCount, heartCount, videoCount
 *   - music: id, title, author, duration, playUrl, original
 *   - desc, createTime, region, language, locationCreated
 *   - textExtra: hashtags, mentions
 *   - stickers, effects, diversificationLabels, suggestedWords
 *
 * NOTE on regional blocks: TikTok is unavailable in some regions (Hong Kong, India, etc.).
 * If this scraper returns no data due to geo-block, it surfaces a clear error so the
 * caller knows to either (a) run from a non-blocked region, (b) provide JSON manually,
 * or (c) use a proxy.
 */

import { chromium } from 'playwright';

export interface ScrapeResult {
  ok: boolean;
  source: 'universal' | 'sigi' | 'dom' | 'none';
  itemStruct?: Record<string, unknown>;
  author?: Record<string, unknown>;
  authorStats?: Record<string, unknown>;
  domFallback?: Record<string, unknown>;
  error?: string;
  geoBlocked?: boolean;
}

/**
 * Scrape a single TikTok video URL using a real headless browser.
 * Returns the embedded itemStruct JSON (when available) plus DOM-extracted counts as fallback.
 *
 * Anti-detection: spoof navigator.webdriver, plugins, languages, chrome.runtime,
 * use a realistic User-Agent, and inject a small init script before each navigation.
 */
export async function scrapeTikTokVideo(url: string): Promise<ScrapeResult> {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      viewport: { width: 1280, height: 720 },
      extraHTTPHeaders: {
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
    });

    // Anti-bot evasion: hide webdriver, fake plugins/languages, add window.chrome
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en'] });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'PDF Viewer' },
          { name: 'Chrome PDF Viewer' },
          { name: 'Chromium PDF Viewer' },
          { name: 'Microsoft Edge PDF Viewer' },
          { name: 'WebKit built-in PDF' },
        ],
      });
      // @ts-expect-error - window.chrome is not in the type defs
      if (!window.chrome) window.chrome = { runtime: {} };
    });

    const page = await context.newPage();

    // Normalize URL: convert mobile/share short URLs to canonical form
    const canonicalUrl = await canonicalizeTikTokUrl(url);

    await page.goto(canonicalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for hydration
    await page.waitForTimeout(4000);

    // Detect geo-block
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
    if (
      bodyText.includes('discontinued operating TikTok') ||
      bodyText.includes('not available in your region') ||
      bodyText.includes('isn\'t available') ||
      page.url().includes('/hk/') ||
      page.url().includes('/about')
    ) {
      return {
        ok: false,
        source: 'none',
        geoBlocked: true,
        error: `TikTok bloqueou esta região (redirecionou para: ${page.url()}). O scraper só funciona de IPs onde o TikTok opera normalmente (ex: Brasil). Alternativas: (1) rode o sistema em um servidor em região permitida, (2) use um proxy brasileiro, (3) cole o JSON manualmente.`,
      };
    }

    // Try to extract embedded JSON
    const extraction = await page.evaluate(() => {
      const tryParse = (text: string | null) => {
        if (!text || text.length < 100) return null;
        try { return JSON.parse(text); } catch { return null; }
      };

      const universal = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      const u = tryParse(universal?.textContent ?? null);
      if (u) return { type: 'universal', data: u };

      const sigi = document.getElementById('SIGI_STATE');
      const s = tryParse(sigi?.textContent ?? null);
      if (s) return { type: 'sigi', data: s };

      return { type: 'none', data: null };
    });

    if (extraction.type === 'universal') {
      const scope = extraction.data?.__DEFAULT_SCOPE__ || {};
      const videoDetail = scope['webapp.video-detail'] || {};
      const itemStruct = videoDetail?.itemInfo?.itemStruct;
      if (itemStruct) {
        return {
          ok: true,
          source: 'universal',
          itemStruct: itemStruct as Record<string, unknown>,
        };
      }
    } else if (extraction.type === 'sigi') {
      const itemModule = extraction.data?.ItemModule;
      if (itemModule && typeof itemModule === 'object') {
        const firstKey = Object.keys(itemModule)[0];
        if (firstKey) {
          return {
            ok: true,
            source: 'sigi',
            itemStruct: itemModule[firstKey] as Record<string, unknown>,
          };
        }
      }
    }

    // Fallback: try DOM scraping via data-e2e attributes
    const domFallback = await page.evaluate(() => {
      const get = (sel: string) =>
        document.querySelector(sel)?.textContent?.trim() || null;
      return {
        likeCount: get('[data-e2e="like-count"]'),
        commentCount: get('[data-e2e="comment-count"]'),
        shareCount: get('[data-e2e="share-count"]'),
        collectCount: get('[data-e2e="undefined-count"]'),
        username: get('[data-e2e="browse-username"]'),
        desc: get('[data-e2e="browse-video-desc"]'),
      };
    });

    if (domFallback.username || domFallback.likeCount) {
      return {
        ok: true,
        source: 'dom',
        domFallback: domFallback as Record<string, unknown>,
      };
    }

    return {
      ok: false,
      source: 'none',
      error:
        'TikTok não retornou os dados do vídeo (possível bloqueio anti-bot ou captcha). Tente novamente em alguns minutos, ou cole o JSON manualmente.',
    };
  } catch (err) {
    return {
      ok: false,
      source: 'none',
      error: `Erro no scraping: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Convert mobile/share URLs to canonical desktop URLs.
 *   https://vm.tiktok.com/ABC123/  →  resolve redirect
 *   https://www.tiktok.com/t/ABC123/  →  resolve redirect
 *   https://m.tiktok.com/v/123.html  →  canonical
 */
async function canonicalizeTikTokUrl(url: string): Promise<string> {
  // Short URLs need to be followed to get the canonical URL
  if (url.match(/(vm\.tiktok\.com|vt\.tiktok\.com|tiktok\.com\/t\/)/i)) {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });
      if (res.url && res.url.includes('tiktok.com')) {
        return res.url;
      }
    } catch {
      // ignore — fall through to using the original URL
    }
  }
  // m.tiktok.com/v/123.html → www.tiktok.com/@unknown/video/123
  const mMatch = url.match(/m\.tiktok\.com\/v\/(\d+)/i);
  if (mMatch) {
    return `https://www.tiktok.com/-/video/${mMatch[1]}`;
  }
  return url;
}

/**
 * Extract a partial video record from the scraped itemStruct.
 * Only captures the fields we need:
 *   - videoViews (playCount), likes (diggCount), comments, shares, saves (collectCount)
 *   - authorUsername
 *   - duration, soundName, description, hashtags, publishDate
 *   - _playAddr / _downloadAddr (private fields for downloading the .mp4)
 */
export function itemStructToRecord(
  item: Record<string, unknown>,
  fallbackUrl: string
): import('./tiktok').PartialVideoRecord {
  const r: import('./tiktok').PartialVideoRecord = {
    videoUrl: fallbackUrl,
    source: 'url',
  };

  // stats — engagement metrics
  const stats = item.stats as Record<string, number> | undefined;
  if (stats) {
    r.videoViews = stats.playCount ?? r.videoViews;
    r.likes = stats.diggCount ?? r.likes;
    r.comments = stats.commentCount ?? r.comments;
    r.shares = stats.shareCount ?? r.shares;
    r.saves = stats.collectCount ?? r.saves;
  }

  // video — duration + playAddr/downloadAddr (for downloading the .mp4)
  const video = item.video as Record<string, unknown> | undefined;
  if (video) {
    r.duration = (video.duration as number) ?? r.duration;
    const playAddr = video.playAddr as string | string[] | undefined;
    const downloadAddr = video.downloadAddr as string | undefined;
    if (typeof playAddr === 'string') (r as Record<string, unknown>)._playAddr = playAddr;
    else if (Array.isArray(playAddr) && playAddr.length > 0) {
      (r as Record<string, unknown>)._playAddr = playAddr[0];
    }
    if (downloadAddr) (r as Record<string, unknown>)._downloadAddr = downloadAddr;
  }

  // author — username only
  const author = item.author as Record<string, unknown> | undefined;
  if (author) {
    r.authorUsername = (author.uniqueId as string) ?? r.authorUsername;
  }

  // music — sound name only
  const music = item.music as Record<string, unknown> | undefined;
  if (music) {
    r.soundName = (music.title as string) ?? r.soundName;
  }

  // description
  r.description = (item.desc as string) ?? r.description;

  // publishDate from createTime (Unix timestamp)
  const ct = item.createTime as number | undefined;
  if (ct) {
    r.publishDate = new Date(ct * 1000);
  }

  // textExtra → hashtags
  const textExtra = item.textExtra as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(textExtra)) {
    const tags: string[] = [];
    for (const t of textExtra) {
      if (t.hashtagName) tags.push(`#${t.hashtagName}`);
    }
    if (tags.length) r.hashtags = tags;
  }

  // Keep the raw itemStruct for audit (in rawMetadata, not as separate DB columns)
  r.rawMetadata = { itemStruct: item };
  return r;
}
