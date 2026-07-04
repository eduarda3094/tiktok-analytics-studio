/**
 * Scrape ALL public videos from a TikTok user profile.
 *
 * Strategy: open https://www.tiktok.com/@username in Playwright, scroll to the bottom,
 * intercept all XHR responses to /api/post/item_list/ which return JSON batches of videos.
 * Aggregate all itemStruct objects across batches.
 *
 * Returns an array of itemStruct records (same shape as scrapeTikTokVideo returns).
 */

import { chromium } from 'playwright';
import type { ScrapeResult } from './tiktok-scraper';

export interface AccountScrapeResult {
  ok: boolean;
  username: string;
  videos: Record<string, unknown>[];
  videoUrls: string[];
  error?: string;
  geoBlocked?: boolean;
  profile?: Record<string, unknown>;
}

/**
 * Scrape all public videos from a TikTok user profile.
 * @param username TikTok username (without @)
 * @param maxVideos safety limit (default 500)
 */
export async function scrapeTikTokAccount(
  username: string,
  maxVideos = 500
): Promise<AccountScrapeResult> {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      viewport: { width: 1280, height: 900 },
      extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en'] });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [{ name: 'PDF Viewer' }, { name: 'Chrome PDF Viewer' }],
      });
      // @ts-expect-error - window.chrome not in type defs
      if (!window.chrome) window.chrome = { runtime: {} };
    });

    const page = await context.newPage();
    const profileUrl = `https://www.tiktok.com/@${username}`;
    const allItems: Record<string, unknown>[] = [];
    let profileData: Record<string, unknown> | undefined;

    // Intercept XHR responses that contain video data
    page.on('response', async (response) => {
      const u = response.url();
      if (
        (u.includes('/api/post/item_list/') || u.includes('/item_list')) &&
        response.status() === 200
      ) {
        try {
          const text = await response.text();
          const json = JSON.parse(text);
          const items = json?.itemList || json?.aweme_list || [];
          if (Array.isArray(items) && items.length > 0) {
            for (const item of items) {
              if (item && typeof item === 'object') {
                allItems.push(item as Record<string, unknown>);
              }
            }
          }
        } catch {
          // ignore parse errors
        }
      }
      // Also capture user profile data
      if (u.includes('/user/detail') || u.includes('user/info')) {
        try {
          const text = await response.text();
          const json = JSON.parse(text);
          if (json?.userInfo?.user || json?.user) {
            profileData = json?.userInfo?.user || json?.user;
          }
        } catch {
          // ignore
        }
      }
    });

    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Detect geo-block
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
    if (
      bodyText.includes('discontinued operating TikTok') ||
      bodyText.includes('not available in your region') ||
      bodyText.includes("isn't available") ||
      page.url().includes('/hk/') ||
      page.url().includes('/about')
    ) {
      return {
        ok: false,
        username,
        videos: [],
        videoUrls: [],
        geoBlocked: true,
        error: `TikTok bloqueou esta região. O scraper só funciona de IPs onde o TikTok opera (ex: Brasil).`,
      };
    }

    // Detect account-not-found
    if (bodyText.toLowerCase().includes('couldn\'t find this account') || bodyText.toLowerCase().includes('could not find this account')) {
      return {
        ok: false,
        username,
        videos: [],
        videoUrls: [],
        error: `Conta @${username} não encontrada no TikTok.`,
      };
    }

    // Scroll to bottom repeatedly to load all videos
    let lastCount = 0;
    let stableScrolls = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 80; // safety limit

    while (scrollAttempts < maxScrollAttempts && allItems.length < maxVideos) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await page.waitForTimeout(1500);
      scrollAttempts++;

      if (allItems.length === lastCount) {
        stableScrolls++;
        if (stableScrolls >= 5) break; // No new content for 5 scrolls — done
      } else {
        stableScrolls = 0;
        lastCount = allItems.length;
      }
    }

    // Deduplicate by video ID
    const seen = new Set<string>();
    const unique: Record<string, unknown>[] = [];
    for (const item of allItems) {
      const id = (item.id as string) || (item.aweme_id as string);
      if (id && !seen.has(id)) {
        seen.add(id);
        unique.push(item);
      }
    }

    // Build canonical URLs for each video
    const videoUrls = unique.map((item) => {
      const id = (item.id as string) || (item.aweme_id as string);
      const author = (item.author as Record<string, unknown> | undefined)?.uniqueId as string | undefined;
      return `https://www.tiktok.com/@${author || username}/video/${id}`;
    });

    return {
      ok: true,
      username,
      videos: unique,
      videoUrls,
      profile: profileData,
    };
  } catch (err) {
    return {
      ok: false,
      username,
      videos: [],
      videoUrls: [],
      error: `Erro no scraping da conta: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
