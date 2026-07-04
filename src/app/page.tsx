"use client";

import { useState, useCallback, useEffect } from "react";
import { Database, PlusCircle, MessageSquare, Sparkles, ListVideo } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppHeader } from "@/components/app-header";
import { StatsCards, type Stats } from "@/components/stats-cards";
import { VideoTable } from "@/components/video-table";
import { AddVideoForm } from "@/components/add-video-form";
import { ChatPanel } from "@/components/chat-panel";
import { JobsPanel } from "@/components/jobs-panel";
import { Toaster as SonnerToaster } from "sonner";

export default function Home() {
  const [tab, setTab] = useState("database");
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [dbVersion, setDbVersion] = useState(0);
  const [nimAvailable, setNimAvailable] = useState<boolean>(true);

  // Check NIM availability once on mount
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setNimAvailable(d.nimAvailable === true))
      .catch(() => setNimAvailable(false));
  }, []);

  const handleStatsChange = useCallback((s: Stats | null) => {
    setStats(s);
    setStatsLoading(false);
  }, []);

  const refreshDatabase = useCallback(() => {
    setDbVersion((v) => v + 1);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-muted/20">
      <AppHeader nimAvailable={nimAvailable} />

      <main className="container mx-auto flex-1 px-4 py-6">
        {/* Hero */}
        <div className="mb-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Central de análise de vídeos{" "}
              <span className="bg-gradient-to-r from-rose-500 via-fuchsia-500 to-cyan-400 bg-clip-text text-transparent">
                TikTok
              </span>
            </h2>
            <p className="text-sm text-muted-foreground">
              Banco de dados completo com todas as métricas · OCR de frames · Transcrição de áudio · IA NVIDIA NIM
            </p>
          </div>
        </div>

        {/* Stats cards (always visible) */}
        <div className="mb-6">
          <StatsCards stats={stats} loading={statsLoading} />
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 max-w-2xl mb-5">
            <TabsTrigger value="database" className="gap-2">
              <Database className="h-4 w-4" /> Banco
            </TabsTrigger>
            <TabsTrigger value="add" className="gap-2">
              <PlusCircle className="h-4 w-4" /> Adicionar
            </TabsTrigger>
            <TabsTrigger value="jobs" className="gap-2">
              <ListVideo className="h-4 w-4" /> Jobs em lote
            </TabsTrigger>
            <TabsTrigger value="chat" className="gap-2">
              <MessageSquare className="h-4 w-4" /> Chat IA
            </TabsTrigger>
          </TabsList>

          <TabsContent value="database" className="mt-0">
            <VideoTable key={dbVersion} onStatsChange={handleStatsChange} />
          </TabsContent>

          <TabsContent value="add" className="mt-0">
            <AddVideoForm onAdded={refreshDatabase} />
          </TabsContent>

          <TabsContent value="jobs" className="mt-0">
            <JobsPanel onDatabaseChanged={refreshDatabase} />
          </TabsContent>

          <TabsContent value="chat" className="mt-0">
            <ChatPanel onDatabaseChanged={refreshDatabase} />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="mt-auto border-t border-border/40 py-4">
        <div className="container mx-auto flex flex-col items-center justify-between gap-2 px-4 text-xs text-muted-foreground sm:flex-row">
          <p>
            TikTok Analytics Studio · NVIDIA NIM · OCR Tesseract · ffmpeg · Whisper/Parakeet ASR
          </p>
          <p>Banco SQLite · Prisma ORM · Next.js 16</p>
        </div>
      </footer>

      <SonnerToaster richColors position="bottom-right" />
    </div>
  );
}
