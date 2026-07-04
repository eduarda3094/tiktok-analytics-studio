import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

interface Params {
  params: Promise<{ id: string }>;
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

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const job = await db.scrapeJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
  return NextResponse.json({ job: parseJob(job as unknown as Record<string, unknown>) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await db.scrapeJob.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
