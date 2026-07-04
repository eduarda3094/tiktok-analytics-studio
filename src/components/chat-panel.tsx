"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Loader2, Wrench, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; args: unknown; result: unknown }>;
}

interface ChatPanelProps {
  onDatabaseChanged: () => void;
}

const SUGGESTIONS = [
  "Quais são os 5 vídeos com mais views? Faça uma análise do que eles têm em comum.",
  "Faça uma análise profunda do vídeo com mais views do banco.",
  "Crie um roteiro de 30s para um vídeo sobre dicas de produtividade, com base no que performa bem no banco.",
  "Quais hashtags estão mais associadas a vídeos com mais de 100k views?",
  "Adicione um vídeo: URL https://www.tiktok.com/@exemplo/video/1, 50000 views, 2000 likes, hashtag #exemplo.",
  "Compare o engajamento médio dos vídeos curtos (<30s) vs longos (>60s).",
];

export function ChatPanel({ onDatabaseChanged }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);

    try {
      const history = newMsgs
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.reply || data.error || "Erro no chat");

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply,
        toolCalls: data.toolCalls || [],
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // If tool calls modified the database, refresh the table
      if (data.toolCalls?.some((tc: { name: string }) => ["create_video", "update_video", "delete_video"].includes(tc.name))) {
        onDatabaseChanged();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao chamar IA");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="flex h-[680px] flex-col overflow-hidden p-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-gradient-to-r from-cyan-500/5 via-fuchsia-500/5 to-rose-500/5 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-gradient-to-br from-cyan-400 via-fuchsia-500 to-rose-500 p-1.5">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Assistente IA · NVIDIA NIM</h2>
            <p className="text-[11px] text-muted-foreground">Análise profunda, roteiros e operações no banco</p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1">
          <Sparkles className="h-3 w-3" /> function calling
        </Badge>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef as never}>
        <div className="space-y-4 p-5">
          {messages.length === 0 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-dashed bg-muted/30 p-5 text-center">
                <Sparkles className="mx-auto h-7 w-7 text-fuchsia-500" />
                <p className="mt-2 text-sm font-medium">Converse com a IA sobre seu banco de vídeos</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ela pode consultar métricas, fazer análise profunda, criar roteiros e inserir/modificar dados.
                  Respostas em texto livre (sem formatação markdown).
                </p>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Sugestões:</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => send(s)}
                      className="rounded-full border bg-background px-3 py-1.5 text-xs text-left transition hover:border-fuchsia-500/50 hover:bg-muted/50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                m.role === "user"
                  ? "bg-muted"
                  : "bg-gradient-to-br from-cyan-400 via-fuchsia-500 to-rose-500"
              }`}>
                {m.role === "user"
                  ? <User className="h-4 w-4 text-muted-foreground" />
                  : <Bot className="h-4 w-4 text-white" />
                }
              </div>
              <div className={`flex flex-col gap-1 max-w-[80%] ${m.role === "user" ? "items-end" : "items-start"}`}>
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div className="space-y-1 w-full max-w-[480px]">
                    {m.toolCalls.map((tc, i) => (
                      <details key={i} className="rounded-md border bg-muted/40 px-2 py-1 text-xs">
                        <summary className="cursor-pointer font-medium text-muted-foreground">
                          <Wrench className="mr-1 inline h-3 w-3" />
                          {tc.name}
                        </summary>
                        <pre className="mt-1 max-h-40 overflow-auto text-[10px] leading-tight whitespace-pre-wrap break-words">
{`argumentos: ${JSON.stringify(tc.args, null, 2)}

resultado: ${typeof tc.result === "string" ? tc.result : JSON.stringify(tc.result, null, 2)}`}
                        </pre>
                      </details>
                    ))}
                  </div>
                )}
                <div className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}>
                  {m.content}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 via-fuchsia-500 to-rose-500">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Processando…
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte sobre o banco, peça uma análise profunda, ou peça para inserir/modificar dados…"
            className="min-h-[44px] flex-1 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
          />
          <Button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            size="icon"
            className="h-11 w-11 bg-gradient-to-br from-cyan-400 via-fuchsia-500 to-rose-500 hover:opacity-90"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
          Shift+Enter para quebrar linha · Enter para enviar
        </p>
      </div>
    </Card>
  );
}
