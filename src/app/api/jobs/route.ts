import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scrapeTikTokAccount } from "@/lib/tiktok-account-scraper";

/**
 * GET /api/jobs
 * Lists all scrape jobs, most recent first.
 */
export async function GET() {
  const jobs = await db.scrapeJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({
    jobs: jobs.map(parseJob),
  });
}

/**
 * POST /api/jobs
 * Body:
 *   { type: "account", username: "tiktok" }
 *   { type: "urls", urls: ["https://...", "https://..."] }
 *   { type: "single", url: "https://..." }
 *
 * Creates a job and returns immediately. The background worker picks it up.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const type = body.type as string;

    let urls: string[] = [];
    let username: string | null = null;

    if (type === "account") {
      username = (body.username as string)?.trim().replace(/^@/, "");
      if (!username) {
        return NextResponse.json({ error: "Informe 'username'" }, { status: 400 });
      }
      // Discovery happens in the worker (takes time)
      // Initial URL list is empty until worker discovers them
      urls = [];
    } else if (type === "urls") {
      const raw = body.urls;
      if (Array.isArray(raw)) {
        urls = raw.map(String).filter((u) => u.includes("tiktok.com"));
      } else if (typeof raw === "string") {
        // Accept textarea input (one URL per line)
        urls = raw.split(/\r?\n/).map((s) => s.trim()).filter((u) => u.includes("tiktok.com"));
      }
      if (urls.length === 0) {
        return NextResponse.json({ error: "Informe ao menos uma URL do TikTok" }, { status: 400 });
      }
    } else if (type === "single") {
      const url = (body.url as string)?.trim();
      if (!url || !url.includes("tiktok.com")) {
        return NextResponse.json({ error: "Informe uma URL válida do TikTok" }, { status: 400 });
      }
      urls = [url];
    } else {
      return NextResponse.json({ error: "Tipo inválido. Use 'account', 'urls' ou 'single'." }, { status: 400 });
    }

    const job = await db.scrapeJob.create({
      data: {
        type,
        status: "pending",
        username,
        urls: JSON.stringify(urls),
        total: urls.length,
      },
    });

    return NextResponse.json({ job: parseJob(job) }, { status: 201 });
  } catch (err) {
    console.error("POST /api/jobs error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}

function parseJob(j: Record<string, unknown>) {
  const out = { ...j };
  for (const k of ["urls", "videoIds", "errors"]) {
    const v = out[k];
    if (typeof v === "string" && v.length > 0) {
      try { out[k] = JSON.parse(v as string); } catch { /* keep */ }
    } else if (v == null) {
      out[k] = k === "urls" ? [] : null;
    }
  }
  return out;
}
