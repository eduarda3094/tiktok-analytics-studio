/**
 * Deep analysis module — computes comprehensive derived metrics
 * for a single video and compares it against the rest of the database.
 *
 * Uses ONLY the fields we have in the simplified schema:
 *   videoViews, likes, comments, shares, saves, duration, likeRate, commentRate, shareRate
 */

import { db } from "@/lib/db";

export interface DeepAnalysis {
  videoId: string;
  author: string | null;

  // === Per-view conversion rates (%) ===
  rates: {
    likeRate: number | null;
    commentRate: number | null;
    shareRate: number | null;
  };

  // === Raw engagement metrics ===
  metrics: {
    videoViews: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    saves: number | null;
    duration: number | null;
  };

  // === Database comparison (percentile rank) ===
  comparison: {
    viewsPercentile: number | null;
    likesPercentile: number | null;
    engagementPercentile: number | null;
    shareRatePercentile: number | null;
    rank: number | null;
    totalInDb: number;
  };

  // === Distribution buckets ===
  buckets: {
    durationCategory: "very_short" | "short" | "medium" | "long" | "very_long" | null;
    engagementCategory: "low" | "average" | "high" | "viral" | null;
    viewTier: "nano" | "micro" | "mid" | "macro" | "mega" | null;
  };

  // === Auto-generated insights ===
  insights: string[];

  // === Recommendations ===
  recommendations: string[];
}

function percentile(value: number | null, all: number[]): number | null {
  if (value == null || all.length === 0) return null;
  const below = all.filter((v) => v < value).length;
  const equal = all.filter((v) => v === value).length;
  return Math.round(((below + 0.5 * equal) / all.length) * 1000) / 10;
}

function categorizeDuration(d: number | null): DeepAnalysis["buckets"]["durationCategory"] {
  if (d == null) return null;
  if (d < 15) return "very_short";
  if (d < 30) return "short";
  if (d < 60) return "medium";
  if (d < 120) return "long";
  return "very_long";
}

function categorizeEngagement(e: number | null): DeepAnalysis["buckets"]["engagementCategory"] {
  if (e == null) return null;
  if (e < 3) return "low";
  if (e < 6) return "average";
  if (e < 10) return "high";
  return "viral";
}

function categorizeViews(v: number | null): DeepAnalysis["buckets"]["viewTier"] {
  if (v == null) return null;
  if (v < 1000) return "nano";
  if (v < 10000) return "micro";
  if (v < 100000) return "mid";
  if (v < 1000000) return "macro";
  return "mega";
}

export async function computeDeepAnalysis(videoId: string): Promise<DeepAnalysis | null> {
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) return null;

  // Fetch all other videos for comparison
  const allVideos = await db.video.findMany({
    where: { id: { not: videoId } },
    select: {
      videoViews: true,
      likes: true,
      likeRate: true,
      commentRate: true,
      shareRate: true,
      duration: true,
    },
  });

  // Per-view rates (use computed rates if available, else compute on the fly)
  const views = video.videoViews;
  const likeRate = video.likeRate ?? (views && video.likes ? Math.round((video.likes / views) * 10000) / 100 : null);
  const commentRate = video.commentRate ?? (views && video.comments ? Math.round((video.comments / views) * 10000) / 100 : null);
  const shareRate = video.shareRate ?? (views && video.shares ? Math.round((video.shares / views) * 10000) / 100 : null);

  // Engagement rate (likes + comments + shares + saves) / views
  const engagementRate = views && views > 0
    ? Math.round(((video.likes ?? 0) + (video.comments ?? 0) + (video.shares ?? 0) + (video.saves ?? 0)) / views * 10000) / 100
    : null;

  const rates: DeepAnalysis["rates"] = {
    likeRate,
    commentRate,
    shareRate,
  };

  const metrics: DeepAnalysis["metrics"] = {
    videoViews: video.videoViews,
    likes: video.likes,
    comments: video.comments,
    shares: video.shares,
    saves: video.saves,
    duration: video.duration,
  };

  // Database comparison
  const allViews = allVideos.map((v) => v.videoViews).filter((v): v is number => v != null);
  const allLikes = allVideos.map((v) => v.likes).filter((v): v is number => v != null);
  const allLikeRates = allVideos.map((v) => v.likeRate).filter((v): v is number => v != null);
  const allShareRates = allVideos.map((v) => v.shareRate).filter((v): v is number => v != null);

  const sortedViewsDesc = [...allViews, views ?? 0].sort((a, b) => b - a);
  const rank = views ? sortedViewsDesc.indexOf(views) + 1 : null;

  const comparison: DeepAnalysis["comparison"] = {
    viewsPercentile: percentile(views, allViews),
    likesPercentile: percentile(video.likes, allLikes),
    engagementPercentile: percentile(engagementRate, allLikeRates),
    shareRatePercentile: percentile(shareRate, allShareRates),
    rank,
    totalInDb: allVideos.length + 1,
  };

  const buckets: DeepAnalysis["buckets"] = {
    durationCategory: categorizeDuration(video.duration),
    engagementCategory: categorizeEngagement(engagementRate),
    viewTier: categorizeViews(views),
  };

  // === Insights ===
  const insights: string[] = [];

  if (views != null) {
    insights.push(`O vídeo tem ${views.toLocaleString("pt-BR")} visualizações (tier: ${buckets.viewTier}).`);
  }
  if (likeRate != null) {
    insights.push(`Taxa de likes: ${likeRate}% (${video.likes?.toLocaleString("pt-BR")} likes).`);
  }
  if (commentRate != null) {
    insights.push(`Taxa de comentários: ${commentRate}% (${video.comments?.toLocaleString("pt-BR")} comentários).`);
  }
  if (shareRate != null) {
    insights.push(
      `Taxa de shares: ${shareRate}% — ` +
      (shareRate > 1
        ? "alta, indica conteúdo altamente compartilhável."
        : shareRate > 0.3
        ? "na média."
        : "baixa, conteúdo menos compartilhável.")
    );
  }
  if (engagementRate != null) {
    const cat = buckets.engagementCategory;
    insights.push(
      `Engajamento total: ${engagementRate}% — classificado como ${cat}. ` +
      (cat === "viral"
        ? "Está em nível viral, muito acima da média do TikTok."
        : cat === "high"
        ? "Está acima da média, com bom engajamento."
        : cat === "average"
        ? "Está na faixa média esperada."
        : "Está abaixo da média — vale revisar o conteúdo.")
    );
  }
  if (comparison.viewsPercentile != null) {
    insights.push(
      `Está no percentil ${comparison.viewsPercentile} de visualizações no banco (rank ${comparison.rank ?? "?"} de ${comparison.totalInDb}).`
    );
  }
  if (video.duration != null) {
    insights.push(`Duração: ${video.duration}s — categoria ${buckets.durationCategory}.`);
  }
  if (video.transcript) {
    const words = video.transcript.split(/\s+/).filter(Boolean).length;
    insights.push(`Transcrição disponível: ${words} palavras extraídas do áudio.`);
  }
  if (video.ocrTitle) {
    insights.push(`Título (via OCR no segundo 2): "${video.ocrTitle}" (confiança: ${video.ocrConfidence?.toFixed(1)}%).`);
  } else {
    insights.push("Sem título extraído via OCR (frame do segundo 2 não tinha texto).");
  }

  // === Recommendations ===
  const recommendations: string[] = [];

  if (engagementRate != null && engagementRate < 3 && views != null && views > 1000) {
    recommendations.push(
      "Engajamento baixo apesar de alcance razoável. Considere revisar o gancho dos primeiros 3 segundos — é onde a maioria decide continuar assistindo ou rolar o feed."
    );
  }
  if (shareRate != null && shareRate < 0.3 && views != null && views > 5000) {
    recommendations.push(
      "Taxa de compartilhamento baixa. Vídeos com apelo emocional, educativo ou de identidade tendem a ser mais compartilhados — experimente adicionar um CTA explícito no final."
    );
  }
  if (likeRate != null && likeRate < 3 && views != null && views > 1000) {
    recommendations.push(
      "Taxa de likes baixa. Verifique se o conteúdo gera identidade ou reação emocional — vídeos que ensinam algo novo ou surpreendem tendem a receber mais likes."
    );
  }
  if (buckets.durationCategory === "very_long" && engagementRate != null && engagementRate < 5) {
    recommendations.push(
      "Vídeo longo com engajamento baixo. Considere dividir em uma série de vídeos mais curtos, ou remover trechos de menor interesse."
    );
  }
  if (engagementRate != null && engagementRate > 8 && views != null && views < 100000) {
    recommendations.push(
      "Engajamento alto mas alcance ainda limitado — esse vídeo tem potencial de viralizar. Considere repostar com leve variação, ou usar o mesmo formato/conceito em novos vídeos."
    );
  }
  if (!video.ocrTitle) {
    recommendations.push(
      "Sem título no frame do segundo 2. Adicionar um título visualmente destacado nos primeiros segundos pode melhorar a retenção e o contexto do vídeo."
    );
  }
  if (!video.transcript) {
    recommendations.push(
      "Sem transcrição disponível. Verifique se a chave NVIDIA_NIM_API_KEY está configurada ou se o Whisper está instalado localmente para que a transcrição seja feita automaticamente."
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "Métricas equilibradas. Continue produzindo conteúdo nesse formato e monitorando a evolução vídeo a vídeo para identificar padrões de sucesso."
    );
  }

  return {
    videoId: video.id,
    author: video.authorUsername,
    rates,
    metrics,
    comparison,
    buckets,
    insights,
    recommendations,
  };
}
