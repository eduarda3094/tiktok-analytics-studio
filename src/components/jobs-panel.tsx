"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Plus, Trash2, RefreshCw, User, Link2, CheckCircle2,
  XCircle, AlertCircle, Clock, ListVideo, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

interface Job {
  id: string;
  type: string;
  status: string; // pending | processing | completed | failed | partial
  username: string | null;
  urls: string[];
  total: number;
  completed: number;
  failed: number;
  videoIds: string[] | null;
  errors: Array<{ url: string; error: string }> | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

interface JobsPanelProps {
  onDatabaseChanged: () => void;
}

export function JobsPanel({ onDatabaseChanged }: JobsPanelProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("account");

  // Account form
  const [username, setUsername] = useState("");
  // URLs form
  const [urlsText, setUrlsText] = useState("");

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) throw new Error("Falha ao buscar jobs");
      const data = await res.json();
      setJobs(data.jobs);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    // Poll every 2 seconds for live progress
    const interval = setInterval(fetchJobs, 2000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const submitAccount = async () => {
    if (!username.trim()) {
      toast.error("Informe o username");
      return;
    }
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "account", username: username.trim().replace(/^@/, "") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      toast.success(`Job criado para @${username.trim().replace(/^@/, "")} — processando em background`);
      setUsername("");
      fetchJobs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  };

  const submitUrls = async () => {
    const urls = urlsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (urls.length === 0) {
      toast.error("Cole ao menos uma URL");
      return;
    }
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "urls", urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      toast.success(`${urls.length} URLs enviadas para processamento em background`);
      setUrlsText("");
      fetchJobs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  };

  const deleteJob = async (id: string) => {
    if (!confirm("Excluir este job do histórico?")) return;
    try {
      await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      fetchJobs();
    } catch {
      toast.error("Erro ao excluir");
    }
  };

  const activeJob = jobs.find((j) => j.status === "processing" || j.status === "pending");

  // Notify parent when a job finishes so the table can refresh
  useEffect(() => {
    const completed = jobs.filter(
      (j) => j.status === "completed" || j.status === "partial" || j.status === "failed"
    );
    const latestFinished = completed[0];
    if (latestFinished && Date.now() - new Date(latestFinished.finishedAt || latestFinished.createdAt).getTime() < 5000) {
      onDatabaseChanged();
    }
  }, [jobs, onDatabaseChanged]);

  return (
    <div className="space-y-4">
      {/* Active job banner */}
      {activeJob && (
        <Card className="border-fuchsia-500/30 bg-fuchsia-500/5 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-fuchsia-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {activeJob.status === "pending" ? "Job na fila" : "Processando"} ·{" "}
                {activeJob.type === "account"
                  ? `@${activeJob.username}`
                  : `${activeJob.total} vídeos`}
              </p>
              <p className="text-xs text-muted-foreground">
                {activeJob.error || `Progresso: ${activeJob.completed}/${activeJob.total} (${activeJob.failed} falhas)`}
              </p>
            </div>
            <Badge variant="outline" className="gap-1">
              <Activity className="h-3 w-3" /> Você pode fechar a aba — o worker continua
            </Badge>
          </div>
          {activeJob.total > 0 && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-rose-500 transition-all"
                style={{ width: `${(activeJob.completed / activeJob.total) * 100}%` }}
              />
            </div>
          )}
        </Card>
      )}

      {/* Create new job */}
      <Card className="overflow-hidden p-0">
        <div className="border-b bg-gradient-to-r from-cyan-500/5 via-fuchsia-500/5 to-rose-500/5 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-gradient-to-br from-cyan-400 to-fuchsia-500 p-2">
              <ListVideo className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Processamento em lote</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Importe todos os vídeos de uma conta do TikTok ou uma lista de URLs de uma vez.
                O processamento roda em background — você pode fechar a aba e voltar depois.
              </p>
            </div>
          </div>
        </div>

        <div className="p-5">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="account" className="gap-2"><User className="h-4 w-4" /> Conta inteira</TabsTrigger>
              <TabsTrigger value="urls" className="gap-2"><Link2 className="h-4 w-4" /> Lista de URLs</TabsTrigger>
            </TabsList>

            <TabsContent value="account" className="mt-4 space-y-3">
              <div>
                <Label htmlFor="username">Username do TikTok</Label>
                <div className="mt-1.5 flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                    <Input
                      id="username"
                      placeholder="tiktok"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="pl-8"
                      onKeyDown={(e) => e.key === "Enter" && submitAccount()}
                    />
                  </div>
                  <Button
                    onClick={submitAccount}
                    disabled={!username.trim() || !!activeJob}
                    className="gap-2 bg-gradient-to-r from-cyan-400 to-fuchsia-500 text-white"
                  >
                    <Plus className="h-4 w-4" /> Iniciar job
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  O sistema descobre TODOS os vídeos públicos da conta via scroll automático,
                  depois processa cada um (scrape + download + OCR + transcrição). Pode levar vários minutos.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="urls" className="mt-4 space-y-3">
              <div>
                <Label htmlFor="urls">URLs (uma por linha)</Label>
                <Textarea
                  id="urls"
                  placeholder={"https://www.tiktok.com/@user/video/123\nhttps://www.tiktok.com/@user/video/456\nhttps://www.tiktok.com/@outro/video/789"}
                  value={urlsText}
                  onChange={(e) => setUrlsText(e.target.value)}
                  className="mt-1.5 min-h-[140px] font-mono text-xs"
                />
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {urlsText.split(/\r?\n/).filter((s) => s.trim()).length} URLs detectadas
                  </p>
                  <Button
                    onClick={submitUrls}
                    disabled={!urlsText.trim() || !!activeJob}
                    className="gap-2 bg-gradient-to-r from-cyan-400 to-fuchsia-500 text-white"
                  >
                    <Plus className="h-4 w-4" /> Iniciar job
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </Card>

      {/* Job history */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Histórico de jobs</h3>
          <Button variant="ghost" size="sm" onClick={fetchJobs} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
        </div>
        {jobs.length === 0 && !loading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nenhum job criado ainda.
          </Card>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} onDelete={() => deleteJob(job.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JobRow({ job, onDelete }: { job: Job; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const progress = job.total > 0 ? (job.completed / job.total) * 100 : 0;
  const isProcessing = job.status === "processing";
  const isPending = job.status === "pending";

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {isProcessing ? (
            <Loader2 className="h-5 w-5 animate-spin text-fuchsia-500" />
          ) : isPending ? (
            <Clock className="h-5 w-5 text-amber-500" />
          ) : job.status === "completed" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          ) : job.status === "failed" ? (
            <XCircle className="h-5 w-5 text-rose-500" />
          ) : (
            <AlertCircle className="h-5 w-5 text-amber-500" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">
              {job.type === "account" ? `Conta @${job.username}` : `${job.urls.length || job.total} URLs`}
            </span>
            <StatusBadge status={job.status} />
            <span className="text-xs text-muted-foreground">
              {new Date(job.createdAt).toLocaleString("pt-BR")}
            </span>
          </div>

          <div className="mt-1.5 text-xs text-muted-foreground">
            {job.total > 0 && (
              <>
                {job.completed} ok · {job.failed} falhas · {job.total} total
                {isProcessing && job.total > 0 && (
                  <span className="ml-2 font-mono">{progress.toFixed(0)}%</span>
                )}
              </>
            )}
            {job.error && !isProcessing && (
              <p className="mt-1 text-amber-600 dark:text-amber-400">{job.error}</p>
            )}
          </div>

          {(isProcessing || isPending) && job.total > 0 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-rose-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {expanded && job.errors && job.errors.length > 0 && (
            <div className="mt-3 space-y-1 rounded-md border bg-muted/30 p-2">
              <p className="text-xs font-medium text-muted-foreground">Erros:</p>
              {job.errors.slice(0, 10).map((e, i) => (
                <div key={i} className="text-[11px]">
                  <span className="font-mono text-rose-500">✗</span>{" "}
                  <span className="break-all">{e.url.slice(0, 80)}</span>
                  <span className="text-muted-foreground"> — {e.error.slice(0, 200)}</span>
                </div>
              ))}
              {job.errors.length > 10 && (
                <p className="text-[11px] text-muted-foreground">+ {job.errors.length - 10} erros…</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          {job.errors && job.errors.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((e) => !e)}
              className="h-7 px-2 text-xs"
            >
              {expanded ? "Ocultar" : "Detalhes"}
            </Button>
          )}
          {!isProcessing && !isPending && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:text-rose-500"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    processing: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
    completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    failed: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
    partial: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  };
  const labels: Record<string, string> = {
    pending: "Na fila",
    processing: "Processando",
    completed: "Concluído",
    failed: "Falhou",
    partial: "Parcial",
  };
  return (
    <Badge variant="outline" className={styles[status] || ""}>
      {labels[status] || status}
    </Badge>
  );
}
