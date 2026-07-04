import { NextRequest, NextResponse } from "next/server";
import { computeDeepAnalysis } from "@/lib/deep-analysis";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const analysis = await computeDeepAnalysis(id);
  if (!analysis) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });
  return NextResponse.json({ analysis });
}
