import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

interface Params {
  params: Promise<{ id: string }>;
}

function parseJsonFields(v: Record<string, unknown>) {
  const out = { ...v };
  for (const key of ["hashtags", "rawMetadata"]) {
    const val = out[key];
    if (typeof val === "string" && val.length > 0) {
      try { out[key] = JSON.parse(val as string); } catch { /* keep */ }
    } else if (val == null || val === "") {
      out[key] = key === "rawMetadata" ? null : [];
    }
  }
  return out;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const video = await db.video.findUnique({ where: { id } });
  if (!video) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ video: parseJsonFields(video as unknown as Record<string, unknown>) });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  let body = await req.json();

  // Support both formats: direct fields or {id, fields: {...}}
  if (body && typeof body === "object" && body.fields && typeof body.fields === "object") {
    body = body.fields;
  }

  const data: Record<string, unknown> = { ...body };

  // JSON-stringify hashtags if provided as array
  if (data.hashtags !== undefined && data.hashtags !== null && typeof data.hashtags !== "string") {
    data.hashtags = JSON.stringify(data.hashtags);
  }

  // Recompute rates when raw metrics change
  const rawKeys = ["videoViews", "likes", "comments", "shares"];
  if (rawKeys.some((k) => data[k] !== undefined)) {
    const existing = await db.video.findUnique({ where: { id } });
    if (existing) {
      const v = (data.videoViews as number) ?? existing.videoViews ?? 0;
      const likes = (data.likes as number) ?? existing.likes ?? 0;
      const comments = (data.comments as number) ?? existing.comments ?? 0;
      const shares = (data.shares as number) ?? existing.shares ?? 0;
      if (v > 0) {
        data.likeRate = Math.round((likes / v) * 10000) / 100;
        data.commentRate = Math.round((comments / v) * 10000) / 100;
        data.shareRate = Math.round((shares / v) * 10000) / 100;
      }
    }
  }

  if (data.publishDate && typeof data.publishDate === "string") {
    data.publishDate = new Date(data.publishDate);
  }

  const updated = await db.video.update({ where: { id }, data });
  return NextResponse.json({ video: parseJsonFields(updated as unknown as Record<string, unknown>) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await db.video.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
