"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Search, RefreshCw, Eye, Heart, MessageCircle, Share2, Bookmark,
  Trash2, ChevronDown, ChevronUp, Filter, X, Clock, Tag, Microscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DeepAnalysisPanel } from "@/components/deep-analysis-panel";

interface Video {
  id: string;
  videoUrl: string;
  videoViews: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  authorUsername: string | null;
  duration: number | null;
  soundName: string | null;
  description: string | null;
  hashtags: string[];
  publishDate: string | null;
  ocrTitle: string | null;
  ocrConfidence: number | null;
  transcript: string | null;
  transcriptEngine: string | null;
  likeRate: number | null;
  commentRate: number | null;
  shareRate: number | null;
  processingStatus: string;
  processingError: string | null;
  source: string;
  createdAt: string;
}

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

function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDuration(sec: number | null): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoTable({ onStatsChange }: { onStatsChange?: (s: Stats | null) => void }) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Video | null>(null);
  const [showDeepAnalysis, setShowDeepAnalysis] = useState(false);

  // Filters
  const [q, setQ] = useState("");
  const [author, setAuthor] = useState("");
  const [minViews, setMinViews] = useState("");
  const [maxViews, setMaxViews] = useState("");
  const [hashtag, setHashtag] = useState("");
  const [minDuration, setMinDuration] = useState("");
  const [maxDuration, setMaxDuration] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortBy, setSortBy] = useState("publishDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showFilters, setShowFilters] = useState(false);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (author) params.set("author", author);
      if (minViews) params.set("minViews", minViews);
      if (maxViews) params.set("maxViews", maxViews);
      if (hashtag) params.set("hashtag", hashtag);
      if (minDuration) params.set("minDuration", minDuration);
      if (maxDuration) params.set("maxDuration", maxDuration);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      params.set("limit", "200");

      const res = await fetch(`/api/videos?${params.toString()}`);
      if (!res.ok) throw new Error("Falha ao buscar vídeos");
      const data = await res.json();
      setVideos(data.videos);
      setTotal(data.total);
      setStats(data.stats);
      onStatsChange?.(data.stats);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar vídeos");
    } finally {
      setLoading(false);
    }
  }, [q, author, minViews, maxViews, hashtag, minDuration, maxDuration, startDate, endDate, sortBy, sortDir, onStatsChange]);

  useEffect(() => {
    const t = setTimeout(fetchVideos, 300);
    return () => clearTimeout(t);
  }, [fetchVideos]);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este vídeo do banco?")) return;
    try {
      const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao excluir");
      toast.success("Vídeo excluído");
      setVideos((v) => v.filter((x) => x.id !== id));
      fetchVideos();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  };

  const clearFilters = () => {
    setQ(""); setAuthor(""); setMinViews(""); setMaxViews("");
    setHashtag(""); setMinDuration(""); setMaxDuration("");
    setStartDate(""); setEndDate("");
  };

  const activeFilters = [author, minViews, maxViews, hashtag, minDuration, maxDuration, startDate, endDate].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por descrição, autor, título (OCR), transcrição, som…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant={showFilters ? "default" : "outline"}
            onClick={() => setShowFilters((s) => !s)}
            className="gap-2"
          >
            <Filter className="h-4 w-4" />
            Filtros
            {activeFilters > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{activeFilters}</Badge>
            )}
          </Button>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="publishDate">Data publicação</SelectItem>
              <SelectItem value="videoViews">Views</SelectItem>
              <SelectItem value="likes">Likes</SelectItem>
              <SelectItem value="comments">Comentários</SelectItem>
              <SelectItem value="shares">Shares</SelectItem>
              <SelectItem value="saves">Saves</SelectItem>
              <SelectItem value="likeRate">Taxa de likes</SelectItem>
              <SelectItem value="commentRate">Taxa de comentários</SelectItem>
              <SelectItem value="shareRate">Taxa de shares</SelectItem>
              <SelectItem value="duration">Duração</SelectItem>
              <SelectItem value="createdAt">Data inserção</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            aria-label="Direção"
          >
            {sortDir === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="icon" onClick={fetchVideos} aria-label="Atualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {showFilters && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 md:grid-cols-4">
            <div>
              <Label className="text-xs">Autor (username)</Label>
              <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="@user" />
            </div>
            <div>
              <Label className="text-xs">Views mín.</Label>
              <Input type="number" value={minViews} onChange={(e) => setMinViews(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label className="text-xs">Views máx.</Label>
              <Input type="number" value={maxViews} onChange={(e) => setMaxViews(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label className="text-xs">Hashtag</Label>
              <Input value={hashtag} onChange={(e) => setHashtag(e.target.value)} placeholder="fyp" />
            </div>
            <div>
              <Label className="text-xs">Duração mín. (s)</Label>
              <Input type="number" value={minDuration} onChange={(e) => setMinDuration(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label className="text-xs">Duração máx. (s)</Label>
              <Input type="number" value={maxDuration} onChange={(e) => setMaxDuration(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label className="text-xs">Publicado de</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Publicado até</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            {activeFilters > 0 && (
              <Button variant="ghost" onClick={clearFilters} className="gap-2">
                <X className="h-4 w-4" /> Limpar filtros
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Results count */}
      <div className="flex items-center justify-between px-1 text-sm text-muted-foreground">
        <span>
          {loading ? "Carregando…" : `${total} vídeo${total === 1 ? "" : "s"} no banco`}
          {total !== videos.length && ` · ${videos.length} exibidos`}
        </span>
      </div>

      {/* Table */}
      <Card className="overflow-hidden p-0">
        <ScrollArea className="h-[560px] w-full">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <TableRow>
                <TableHead className="w-[280px]">Vídeo</TableHead>
                <TableHead>Autor</TableHead>
                <TableHead className="text-right"><Eye className="inline h-3.5 w-3.5" /></TableHead>
                <TableHead className="text-right"><Heart className="inline h-3.5 w-3.5" /></TableHead>
                <TableHead className="text-right"><MessageCircle className="inline h-3.5 w-3.5" /></TableHead>
                <TableHead className="text-right"><Share2 className="inline h-3.5 w-3.5" /></TableHead>
                <TableHead className="text-right"><Bookmark className="inline h-3.5 w-3.5" /></TableHead>
                <TableHead className="text-right">Like %</TableHead>
                <TableHead className="text-right">Share %</TableHead>
                <TableHead className="text-right"><Clock className="inline h-3.5 w-3.5" /></TableHead>
                <TableHead>Publicado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {videos.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={12} className="py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="h-8 w-8 opacity-30" />
                      <p>Nenhum vídeo encontrado no banco.</p>
                      <p className="text-xs">Use a aba “Adicionar” para inserir URLs, arquivos ou JSON.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {videos.map((v) => (
                <TableRow
                  key={v.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => { setSelected(v); setShowDeepAnalysis(false); }}
                >
                  <TableCell className="max-w-[280px]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {v.ocrTitle || <span className="italic text-muted-foreground">sem título</span>}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1">
                        {v.processingStatus === "completed" && (
                          <Badge variant="outline" className="h-4 px-1 text-[10px] text-emerald-600 dark:text-emerald-400">ok</Badge>
                        )}
                        {v.transcript && (
                          <Badge variant="outline" className="h-4 px-1 text-[10px]">transcrito</Badge>
                        )}
                        {v.ocrTitle && (
                          <Badge variant="outline" className="h-4 px-1 text-[10px]">OCR</Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">@{v.authorUsername || "—"}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatNum(v.videoViews)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatNum(v.likes)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatNum(v.comments)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatNum(v.shares)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatNum(v.saves)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {v.likeRate != null ? v.likeRate.toFixed(2) + "%" : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {v.shareRate != null ? v.shareRate.toFixed(2) + "%" : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatDuration(v.duration)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(v.publishDate)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 hover:text-rose-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(v.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>

      {/* Detail modal */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-8">
              {selected?.ocrTitle || "Vídeo sem título (sem texto no frame do segundo 2)"}
            </DialogTitle>
            <DialogDescription>
              @{selected?.authorUsername || "desconhecido"} ·{" "}
              {selected?.publishDate ? formatDate(selected.publishDate) : "data desconhecida"}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              {/* Toggle between Overview and Deep Analysis */}
              <div className="flex gap-2 border-b">
                <button
                  className={`px-4 py-2 text-sm font-medium transition ${!showDeepAnalysis ? "border-b-2 border-fuchsia-500 text-foreground" : "text-muted-foreground"}`}
                  onClick={() => setShowDeepAnalysis(false)}
                >
                  Visão geral
                </button>
                <button
                  className={`px-4 py-2 text-sm font-medium transition flex items-center gap-1.5 ${showDeepAnalysis ? "border-b-2 border-fuchsia-500 text-foreground" : "text-muted-foreground"}`}
                  onClick={() => setShowDeepAnalysis(true)}
                >
                  <Microscope className="h-3.5 w-3.5" /> Análise profunda
                </button>
              </div>

              {!showDeepAnalysis ? (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { l: "Views", v: formatNum(selected.videoViews) },
                      { l: "Likes", v: formatNum(selected.likes) },
                      { l: "Comentários", v: formatNum(selected.comments) },
                      { l: "Shares", v: formatNum(selected.shares) },
                      { l: "Saves", v: formatNum(selected.saves) },
                      { l: "Duração", v: formatDuration(selected.duration) },
                      { l: "Like rate", v: selected.likeRate?.toFixed(2) + "%" || "—" },
                      { l: "Share rate", v: selected.shareRate?.toFixed(2) + "%" || "—" },
                    ].map((s) => (
                      <div key={s.l} className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">{s.l}</p>
                        <p className="mt-1 text-sm font-semibold">{s.v}</p>
                      </div>
                    ))}
                  </div>
                  {selected.description && (
                    <div>
                      <h4 className="mb-1 text-sm font-semibold">Descrição</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selected.description}</p>
                    </div>
                  )}
                  {selected.hashtags && selected.hashtags.length > 0 && (
                    <div>
                      <h4 className="mb-1 text-sm font-semibold">Hashtags</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.hashtags.map((h, i) => (
                          <Badge key={i} variant="secondary" className="gap-1">
                            <Tag className="h-3 w-3" /> {h}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {selected.soundName && (
                    <div>
                      <h4 className="mb-1 text-sm font-semibold">Som</h4>
                      <p className="text-sm">{selected.soundName}</p>
                    </div>
                  )}
                  {selected.ocrTitle && (
                    <div>
                      <h4 className="mb-1 text-sm font-semibold">Título (OCR no segundo 2)</h4>
                      <p className="text-sm">{selected.ocrTitle}</p>
                      {selected.ocrConfidence != null && (
                        <p className="mt-1 text-xs text-muted-foreground">Confiança: {selected.ocrConfidence.toFixed(1)}%</p>
                      )}
                    </div>
                  )}
                  {selected.transcript && (
                    <div>
                      <h4 className="mb-1 text-sm font-semibold">Transcrição</h4>
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="gap-2">
                            {selected.transcript.slice(0, 120)}…
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2 rounded-lg border bg-muted/30 p-3">
                          <p className="text-sm whitespace-pre-wrap">{selected.transcript}</p>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  )}
                  {selected.processingError && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                      <p className="font-medium text-amber-700 dark:text-amber-400">Avisos de processamento</p>
                      <p className="mt-1 text-xs">{selected.processingError}</p>
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setShowDeepAnalysis(true)}
                    >
                      <Microscope className="h-4 w-4" /> Ver análise profunda
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 hover:text-rose-500"
                      onClick={() => { handleDelete(selected.id); setSelected(null); }}
                    >
                      <Trash2 className="h-4 w-4" /> Excluir
                    </Button>
                  </div>
                </>
              ) : (
                <DeepAnalysisPanel videoId={selected.id} />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
