"use client";

import { Eye, Heart, MessageCircle, Share2, Bookmark, Clock, TrendingUp, Database } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Stats {
  count: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  avgDuration: number;
  avgLikeRate: number;
  avgCommentRate: number;
  avgShareRate: number;
}

function formatNum(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function formatDuration(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function StatsCards({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="h-24 animate-pulse bg-muted/40" />
        ))}
      </div>
    );
  }

  const cards = [
    { label: "Vídeos", value: String(stats.count), icon: Database, color: "text-fuchsia-500" },
    { label: "Views", value: formatNum(stats.totalViews), icon: Eye, color: "text-cyan-500" },
    { label: "Likes", value: formatNum(stats.totalLikes), icon: Heart, color: "text-rose-500" },
    { label: "Comentários", value: formatNum(stats.totalComments), icon: MessageCircle, color: "text-amber-500" },
    { label: "Shares", value: formatNum(stats.totalShares), icon: Share2, color: "text-emerald-500" },
    { label: "Saves", value: formatNum(stats.totalSaves), icon: Bookmark, color: "text-violet-500" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <Card key={c.label} className="relative overflow-hidden p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-xl font-bold tracking-tight">{c.value}</p>
              </div>
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </div>
          </Card>
        ))}
      </div>
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          Duração média: <span className="font-semibold text-foreground">{formatDuration(stats.avgDuration)}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          Like rate médio: <span className="font-semibold text-foreground">{stats.avgLikeRate.toFixed(2)}%</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageCircle className="h-4 w-4" />
          Comment rate médio: <span className="font-semibold text-foreground">{stats.avgCommentRate.toFixed(2)}%</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Share2 className="h-4 w-4" />
          Share rate médio: <span className="font-semibold text-foreground">{stats.avgShareRate.toFixed(2)}%</span>
        </div>
      </Card>
    </div>
  );
}
