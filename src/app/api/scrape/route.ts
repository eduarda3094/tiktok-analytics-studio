import { NextRequest, NextResponse } from "next/server";
import { scrapeTikTokVideo, itemStructToRecord } from "@/lib/tiktok-scraper";

/**
 * GET /api/scrape?url=<tiktok-url>
 * Tests the Playwright scraper on a single TikTok URL.
 * Returns the extracted itemStruct + normalized record.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Parâmetro 'url' é obrigatório" }, { status: 400 });
  }
  if (!url.includes("tiktok.com")) {
    return NextResponse.json({ error: "URL deve ser do tiktok.com" }, { status: 400 });
  }

  const startedAt = Date.now();
  const result = await scrapeTikTokVideo(url);
  const elapsed = Date.now() - startedAt;

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      error: result.error,
      geoBlocked: result.geoBlocked,
      elapsedMs: elapsed,
    }, { status: result.geoBlocked ? 451 : 502 });
  }

  const normalized = result.itemStruct
    ? itemStructToRecord(result.itemStruct, url)
    : null;

  return NextResponse.json({
    ok: true,
    source: result.source,
    elapsedMs: elapsed,
    itemStruct: result.itemStruct,
    normalized,
  });
}
