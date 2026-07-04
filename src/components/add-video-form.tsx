"use client";

import { useState, useCallback } from "react";
import { Upload, Link2, Code2, Sparkles, Loader2, FileVideo, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface AddVideoFormProps {
  onAdded: () => void;
}

export function AddVideoForm({ onAdded }: AddVideoFormProps) {
  const [tab, setTab] = useState("url");
  const [loading, setLoading] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  // URL tab
  const [url, setUrl] = useState("");
  // Upload tab
  const [file, setFile] = useState<File | null>(null);
  // JSON tab
  const [jsonText, setJsonText] = useState(`{
  "videoUrl": "https://www.tiktok.com/@user/video/123",
  "authorUsername": "user",
  "videoViews": 1250000,
  "likes": 98000,
  "comments": 1240,
  "shares": 4300,
  "saves": 2100,
  "duration": 32,
  "soundName": "Som Original",
  "description": "Legenda do vídeo com #hashtags",
  "hashtags": ["#fyp", "#viral"],
  "publishDate": "2025-06-15T10:00:00Z"
}`);

  // Common options
  const [runOcr, setRunOcr] = useState(true);
  const [runTranscribe, setRunTranscribe] = useState(true);

  const handleSubmit = useCallback(async () => {
    setLoading(true);
    setLastAdded(null);
    try {
      const formData = new FormData();
      let hasPayload = false;
      let endpoint = "/api/videos";

      if (tab === "url") {
        if (!url.trim()) throw new Error("Informe uma URL");
        formData.append("url", url.trim());
        hasPayload = true;
      } else if (tab === "upload") {
        if (!file) throw new Error("Selecione um arquivo");
        formData.append("file", file);
        hasPayload = true;
      } else if (tab === "json") {
        if (!jsonText.trim()) throw new Error("Cole um JSON");
        try { JSON.parse(jsonText); } catch { throw new Error("JSON inválido"); }
        formData.append("json", jsonText);
        hasPayload = true;
      }

      if (!hasPayload) throw new Error("Preencha os campos");

      formData.append("runOcr", String(runOcr));
      formData.append("runTranscribe", String(runTranscribe));

      toast.info("Processando vídeo… (pode levar alguns segundos)");

      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Erro ${res.status}`);
      }

      // Detect geo-block or partial scraping and warn the user
      const rawMeta = data.video?.rawMetadata as { geoBlocked?: boolean; scrapeError?: string } | undefined;
      if (rawMeta?.geoBlocked) {
        toast.warning(
          "Vídeo salvo, mas o TikTok bloqueou o scraping da região do servidor. " +
          "Métricas públicas não puderam ser extraídas automaticamente. " +
          "Cole o JSON manualmente ou rode o sistema num IP não bloqueado (ex: Brasil).",
          { duration: 8000 }
        );
      } else if (data.video?.videoViews == null && tab === "url") {
        toast.info(
          "Vídeo salvo, mas não foi possível extrair todas as métricas. " +
          "Você pode complementar via edição ou colar o JSON manual.",
          { duration: 5000 }
        );
      } else {
        toast.success("Vídeo adicionado ao banco!");
      }
      setLastAdded(data.video?.title || data.video?.ocrTitle || data.video?.videoUrl);
      onAdded();

      // Reset fields
      if (tab === "url") setUrl("");
      if (tab === "upload") setFile(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar vídeo");
    } finally {
      setLoading(false);
    }
  }, [tab, url, file, jsonText, runOcr, runTranscribe, onAdded]);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        <div className="border-b bg-gradient-to-r from-rose-500/5 via-fuchsia-500/5 to-cyan-500/5 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-gradient-to-br from-rose-500 to-fuchsia-500 p-2">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Adicionar vídeo ao banco</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Informe uma URL do TikTok, faça upload de um arquivo .mp4 ou cole um JSON com as métricas.
                O sistema extrai metadados, roda OCR no frame do segundo 2 e transcreve o áudio automaticamente.
              </p>
            </div>
          </div>
        </div>

        <div className="p-5">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="url" className="gap-2"><Link2 className="h-4 w-4" /> URL TikTok</TabsTrigger>
              <TabsTrigger value="upload" className="gap-2"><Upload className="h-4 w-4" /> Upload arquivo</TabsTrigger>
              <TabsTrigger value="json" className="gap-2"><Code2 className="h-4 w-4" /> JSON manual</TabsTrigger>
            </TabsList>

            <TabsContent value="url" className="mt-4 space-y-3">
              <div>
                <Label htmlFor="url">URL do vídeo TikTok</Label>
                <Input
                  id="url"
                  placeholder="https://www.tiktok.com/@usuario/video/1234567890"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="mt-1.5"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  O sistema abre a página com navegador real (Playwright) e extrai TODAS as métricas públicas do TikTok:
                  views, likes, comments, shares, saves, duração, dimensões, codec, autor, seguidores, som, hashtags,
                  descrição e data de publicação. Depois baixa o .mp4 automaticamente para rodar OCR (frame 2s) e transcrição.
                  Funciona para vídeos de terceiros E seus próprios vídeos — mesmas métricas em tudo.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="upload" className="mt-4 space-y-3">
              <div>
                <Label htmlFor="file">Arquivo de vídeo (.mp4, .mov, .webm)</Label>
                <label
                  htmlFor="file"
                  className="mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 transition hover:border-fuchsia-500/50 hover:bg-muted/50"
                >
                  <FileVideo className="h-10 w-10 text-muted-foreground" />
                  <span className="mt-2 text-sm font-medium">
                    {file ? file.name : "Clique para selecionar ou arraste aqui"}
                  </span>
                  <span className="mt-1 text-xs text-muted-foreground">
                    MP4, MOV, WebM até ~200MB
                  </span>
                  <input
                    id="file"
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </TabsContent>

            <TabsContent value="json" className="mt-4 space-y-3">
              <div>
                <Label htmlFor="json">JSON com métricas do vídeo</Label>
                <Textarea
                  id="json"
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  className="mt-1.5 min-h-[260px] font-mono text-xs"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Campos aceitos: videoUrl, authorUsername, videoViews, likes, comments, shares, saves, duration, soundName, description, hashtags, publishDate.
                  Também aceita aliases (views, plays, diggs) e estruturas aninhadas (author.username, stats.playCount, music.title, video.duration).
                  likeRate, commentRate e shareRate são calculados automaticamente se videoViews for fornecido.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {/* Processing options */}
          <div className="mt-5 flex flex-wrap items-center gap-6 rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <Switch id="ocr" checked={runOcr} onCheckedChange={setRunOcr} />
              <Label htmlFor="ocr" className="cursor-pointer text-sm">
                OCR do título (frame 2s)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="transcribe" checked={runTranscribe} onCheckedChange={setRunTranscribe} />
              <Label htmlFor="transcribe" className="cursor-pointer text-sm">
                Transcrição de áudio
              </Label>
            </div>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {runOcr && <Badge variant="outline" className="gap-1">ffmpeg + tesseract</Badge>}
              {runTranscribe && (
                <Badge variant="outline" className="gap-1">NVIDIA NIM Parakeet ASR</Badge>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="mt-5 flex items-center gap-3">
            <Button
              onClick={handleSubmit}
              disabled={loading}
              size="lg"
              className="gap-2 bg-gradient-to-r from-rose-500 to-fuchsia-500 text-white hover:from-rose-600 hover:to-fuchsia-600"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {loading ? "Processando…" : "Adicionar ao banco"}
            </Button>
            {lastAdded && !loading && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Adicionado: {lastAdded.slice(0, 50)}
              </span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
