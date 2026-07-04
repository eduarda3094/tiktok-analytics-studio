"use client";

import { useState, useEffect } from "react";
import {
  Loader2, AlertCircle, Lightbulb, Gauge, Award, BarChart3,
  Eye, Heart, MessageCircle, Share2, Bookmark, Clock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DeepAnalysis {
  videoId: string;
  author: string | null;
  rates: {
    likeRate: number | null;
    commentRate: number | null;
    shareRate: number | null;
  };
  metrics: {
    videoViews: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    saves: number | null;
    duration: number | null;
  };
  comparison: {
    viewsPercentile: number | null;
    likesPercentile: number | null;
    engagementPercentile: number | null;
    shareRatePercentile: number | null;
    rank: number | null;
    totalInDb: number;
  };
  buckets: {
    durationCategory: string | null;
    engagementCategory: string | null;
    viewTier: string | null;
  };
  insights: string[];
  recommendations: string[];
}

function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function formatPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toFixed(2) + "%";
}

function formatDuration(sec: number | null | undefined): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const ENGAGEMENT_COLORS: Record<string, string> = {
  viral: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  high: "border-cyan-500/40 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  average: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  low: "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

const ENGAGEMENT_LABEL: Record<string, string> = {
  viral: "Viral",
  high: "Alto",
  average: "Médio",
  low: "Baixo",
};

const DURATION_LABEL: Record<string, string> = {
  very_short: "Muito curto (<15s)",
  short: "Curto (15-30s)",
  medium: "Médio (30-60s)",
  long: "Longo (60-120s)",
  very_long: "Muito longo (>120s)",
};

const VIEW_TIER_LABEL: Record<string, string> = {
  nano: "Nano (<1K)",
  micro: "Micro (1K-10K)",
  mid: "Mid (10K-100K)",
  macro: "Macro (100K-1M)",
  mega: "Mega (>1M)",
};

export function DeepAnalysisPanel({ videoId }: { videoId: string }) {
  const [analysis, setAnalysis] = useState<DeepAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/videos/${videoId}/deep-analysis`);
        if (!r.ok) throw new Error("Falha ao buscar análise");
        const d = await r.json();
        if (!cancelled) {
          setAnalysis(d.analysis);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar análise");
          setLoading(false);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [videoId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Calculando métricas…
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="flex h-64 items-center justify-center text-rose-500">
        <AlertCircle className="mr-2 h-5 w-5" /> {error || "Erro ao carregar análise"}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-2">
      {/* Classification badges */}
      <div className="flex flex-wrap gap-2">
        {analysis.buckets.viewTier && (
          <Badge variant="outline" className="gap-1.5">
            <Eye className="h-3 w-3" /> {VIEW_TIER_LABEL[analysis.buckets.viewTier] || analysis.buckets.viewTier}
          </Badge>
        )}
        {analysis.buckets.engagementCategory && (
          <Badge variant="outline" className={`gap-1.5 ${ENGAGEMENT_COLORS[analysis.buckets.engagementCategory] || ""}`}>
            <Gauge className="h-3 w-3" /> Engajamento {ENGAGEMENT_LABEL[analysis.buckets.engagementCategory] || analysis.buckets.engagementCategory}
          </Badge>
        )}
        {analysis.buckets.durationCategory && (
          <Badge variant="outline" className="gap-1.5">
            <Clock className="h-3 w-3" /> {DURATION_LABEL[analysis.buckets.durationCategory] || analysis.buckets.durationCategory}
          </Badge>
        )}
        {analysis.comparison.rank && (
          <Badge variant="outline" className="gap-1.5 border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400">
            <Award className="h-3 w-3" /> Rank #{analysis.comparison.rank} de {analysis.comparison.totalInDb}
          </Badge>
        )}
      </div>

      {/* Raw metrics grid */}
      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <BarChart3 className="h-4 w-4" /> Métricas brutas
        </h4>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-3">
          {[
            { l: "Views", v: formatNum(analysis.metrics.videoViews), icon: Eye },
            { l: "Likes", v: formatNum(analysis.metrics.likes), icon: Heart },
            { l: "Comentários", v: formatNum(analysis.metrics.comments), icon: MessageCircle },
            { l: "Shares", v: formatNum(analysis.metrics.shares), icon: Share2 },
            { l: "Saves", v: formatNum(analysis.metrics.saves), icon: Bookmark },
            { l: "Duração", v: formatDuration(analysis.metrics.duration), icon: Clock },
          ].map((s) => (
            <div key={s.l} className="rounded-lg border bg-muted/20 p-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">{s.l}</p>
                <s.icon className="h-3 w-3 text-muted-foreground" />
              </div>
              <p className="mt-1 text-sm font-bold">{s.v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Conversion rates */}
      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Gauge className="h-4 w-4" /> Taxas calculadas (por view)
        </h4>
        <Card className="p-3">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Like rate</p>
              <p className="font-bold">{formatPct(analysis.rates.likeRate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Comment rate</p>
              <p className="font-bold">{formatPct(analysis.rates.commentRate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Share rate</p>
              <p className="font-bold">{formatPct(analysis.rates.shareRate)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Database comparison (percentiles) */}
      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <BarChart3 className="h-4 w-4" /> Comparação com o banco (percentis)
        </h4>
        <div className="space-y-2">
          {[
            { l: "Views", p: analysis.comparison.viewsPercentile },
            { l: "Likes", p: analysis.comparison.likesPercentile },
            { l: "Engajamento", p: analysis.comparison.engagementPercentile },
            { l: "Share rate", p: analysis.comparison.shareRatePercentile },
          ].map((s) => (
            <div key={s.l} className="flex items-center gap-3">
              <span className="w-28 text-xs text-muted-foreground">{s.l}</span>
              <div className="flex-1">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-rose-500"
                    style={{ width: `${s.p ?? 0}%` }}
                  />
                </div>
              </div>
              <span className="w-12 text-right text-xs font-mono">
                {s.p != null ? `P${s.p.toFixed(0)}` : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Insights */}
      {analysis.insights.length > 0 && (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Lightbulb className="h-4 w-4" /> Insights automáticos
          </h4>
          <div className="space-y-1.5">
            {analysis.insights.map((ins, i) => (
              <div key={i} className="rounded-lg border bg-muted/20 p-2.5 text-xs text-foreground">
                {ins}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {analysis.recommendations.length > 0 && (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <AlertCircle className="h-4 w-4" /> Recomendações
          </h4>
          <div className="space-y-1.5">
            {analysis.recommendations.map((rec, i) => (
              <div key={i} className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 p-2.5 text-xs text-foreground">
                {rec}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
