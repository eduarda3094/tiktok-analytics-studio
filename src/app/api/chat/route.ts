import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nimChat, isNimAvailable, type NimTool, type NimChatMessage } from "@/lib/nvidia-nim";
import { computeDeepAnalysis } from "@/lib/deep-analysis";

/**
 * AI Chat endpoint with function calling.
 *
 * Schema simplificado — apenas: videoViews, likes, comments, shares, saves,
 * authorUsername, duration, soundName, description, hashtags, publishDate,
 * ocrTitle, transcript, likeRate, commentRate, shareRate.
 *
 * Replies are returned as plain text (NO markdown) — the user wants free-form text.
 */

const SYSTEM_PROMPT = `Você é um assistente especializado em análise de vídeos do TikTok.
Você tem acesso a um banco de dados local via ferramentas (function calling).

Campos disponíveis no banco (apenas esses):
- Métricas: videoViews, likes, comments, shares, saves
- Autor: authorUsername (@ do autor)
- Vídeo: duration (segundos), soundName, description (legenda), hashtags, publishDate
- Processados: ocrTitle (título extraído via OCR no frame 2), transcript (transcrição do áudio)
- Calculados: likeRate, commentRate, shareRate (cada um = métrica / views × 100)

Suas capacidades:
- Consultar e filtrar vídeos por qualquer métrica
- Calcular estatísticas agregadas (médias, totais, top-N, percentis)
- Fazer ANÁLISE PROFUNDA de um vídeo específico (use deep_analyze_video)
- Inserir, modificar e excluir registros no banco
- Sugerir ideias de conteúdo, criar roteiros e estratégias com base nos dados
- Analisar tendências

REGRAS IMPORTANTES SOBRE FORMATO DA RESPOSTA:
- Escreva em texto puro e natural, COMO SE ESTIVESSE FALANDO com o usuário.
- NÃO use markdown em nenhuma circunstância: sem asteriscos (*), sem cerquilhas (#), sem crases (\`), sem traços no início de linha como marcadores.
- NÃO use tabelas markdown. Se precisar listar dados, use frases simples ou listas numeradas (1. 2. 3.) com texto comum.
- Use quebras de linha normais (Enter) para separar parágrafos.
- Pode usar números, porcentagens, datas e nomes normalmente.
- Para roteiros de vídeo, escreva no formato: "Cena 1: ...", "Cena 2: ..." em texto puro.
- Seja claro, direto e objetivo. Sem floreios desnecessários.

REGRAS DE COMPORTAMENTO:
- Sempre que o usuário pedir análise de um vídeo, use a ferramenta deep_analyze_video.
- Quando inserir ou modificar dados, confirme o que foi feito em uma frase simples.
- Se não houver dados suficientes, diga isso claramente e sugira o que pode ser feito.
- Responda em português brasileiro.`;

const TOOLS: NimTool[] = [
  {
    type: "function",
    function: {
      name: "query_videos",
      description:
        "Busca vídeos no banco com filtros opcionais. Retorna até 50 vídeos. Campos: id, videoUrl, videoViews, likes, comments, shares, saves, authorUsername, duration, soundName, description, hashtags, publishDate, ocrTitle, transcript, likeRate, commentRate, shareRate.",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string", description: "Texto livre para buscar em description, authorUsername, ocrTitle, transcript, soundName" },
          author: { type: "string", description: "Username exato do autor (sem @)" },
          minViews: { type: "integer", description: "videoViews mínimo" },
          maxViews: { type: "integer" },
          minLikes: { type: "integer" },
          minDuration: { type: "integer", description: "segundos" },
          maxDuration: { type: "integer", description: "segundos" },
          hashtag: { type: "string" },
          startDate: { type: "string", description: "ISO date" },
          endDate: { type: "string", description: "ISO date" },
          sortBy: {
            type: "string",
            enum: ["videoViews", "likes", "comments", "shares", "saves",
              "publishDate", "duration", "likeRate", "commentRate", "shareRate"],
          },
          sortDir: { type: "string", enum: ["asc", "desc"] },
          limit: { type: "integer", default: 50 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_video",
      description: "Busca um único vídeo pelo seu ID, com TODOS os campos.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deep_analyze_video",
      description:
        "Faz uma ANÁLISE PROFUNDA de um vídeo específico. Retorna: taxas (likeRate, commentRate, shareRate), métricas brutas (videoViews, likes, comments, shares, saves, duration), comparação com o banco (percentis em views, likes, engajamento, share rate; rank), buckets (durationCategory, engagementCategory, viewTier), insights automáticos e recomendações acionáveis. Use SEMPRE que o usuário pedir análise profunda de um vídeo.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_stats",
      description:
        "Retorna estatísticas agregadas do banco: contagem total, soma de videoViews/likes/comments/shares/saves, média de duração e médias de likeRate/commentRate/shareRate.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "create_video",
      description: "Cria um novo registro de vídeo. Use para inserir dados manualmente. As taxas likeRate, commentRate, shareRate são calculadas automaticamente se videoViews for fornecido.",
      parameters: {
        type: "object",
        properties: {
          videoUrl: { type: "string" },
          description: { type: "string" },
          authorUsername: { type: "string" },
          videoViews: { type: "integer" },
          likes: { type: "integer" },
          comments: { type: "integer" },
          shares: { type: "integer" },
          saves: { type: "integer" },
          duration: { type: "integer", description: "segundos" },
          publishDate: { type: "string", description: "ISO date" },
          hashtags: { type: "array", items: { type: "string" } },
          soundName: { type: "string" },
          ocrTitle: { type: "string" },
          transcript: { type: "string" },
        },
        required: ["videoUrl"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_video",
      description: "Atualiza campos de um vídeo existente. Apenas os campos fornecidos serão alterados. As taxas likeRate, commentRate, shareRate são recalculadas automaticamente quando videoViews, likes, comments ou shares mudam.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          fields: {
            type: "object",
            description: "Campos a alterar. Campos possíveis: videoUrl, description, authorUsername, videoViews, likes, comments, shares, saves, duration, publishDate, hashtags, soundName, ocrTitle, transcript.",
            additionalProperties: true,
          },
        },
        required: ["id", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_video",
      description: "Exclui permanentemente um vídeo do banco.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
];

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case "query_videos": {
        const where: Record<string, unknown> = {};
        const AND: Record<string, unknown>[] = [];
        if (args.q) {
          AND.push({
            OR: [
              { description: { contains: args.q as string } },
              { authorUsername: { contains: args.q as string } },
              { ocrTitle: { contains: args.q as string } },
              { transcript: { contains: args.q as string } },
              { soundName: { contains: args.q as string } },
            ],
          });
        }
        if (args.author) where.authorUsername = args.author;
        if (args.minViews) AND.push({ videoViews: { gte: args.minViews as number } });
        if (args.maxViews) AND.push({ videoViews: { lte: args.maxViews as number } });
        if (args.minLikes) AND.push({ likes: { gte: args.minLikes as number } });
        if (args.minDuration) AND.push({ duration: { gte: args.minDuration as number } });
        if (args.maxDuration) AND.push({ duration: { lte: args.maxDuration as number } });
        if (args.hashtag) AND.push({ hashtags: { contains: args.hashtag as string } });
        if (args.startDate) AND.push({ publishDate: { gte: new Date(args.startDate as string) } });
        if (args.endDate) AND.push({ publishDate: { lte: new Date(args.endDate as string) } });
        if (AND.length) where.AND = AND;
        const sortBy = (args.sortBy as string) || "publishDate";
        const sortDir = args.sortDir === "asc" ? "asc" : "desc";
        const limit = Math.min((args.limit as number) || 50, 50);
        const videos = await db.video.findMany({
          where,
          orderBy: { [sortBy]: sortDir },
          take: limit,
        });
        const compact = videos.map((v) => ({
          id: v.id,
          videoUrl: v.videoUrl,
          videoViews: v.videoViews,
          likes: v.likes,
          comments: v.comments,
          shares: v.shares,
          saves: v.saves,
          authorUsername: v.authorUsername,
          duration: v.duration,
          soundName: v.soundName,
          description: v.description,
          hashtags: v.hashtags,
          publishDate: v.publishDate,
          ocrTitle: v.ocrTitle,
          likeRate: v.likeRate,
          commentRate: v.commentRate,
          shareRate: v.shareRate,
        }));
        return JSON.stringify({ count: videos.length, videos: compact });
      }
      case "get_video": {
        const v = await db.video.findUnique({ where: { id: args.id as string } });
        return v ? JSON.stringify(v) : JSON.stringify({ error: "Não encontrado" });
      }
      case "deep_analyze_video": {
        const analysis = await computeDeepAnalysis(args.id as string);
        if (!analysis) return JSON.stringify({ error: "Vídeo não encontrado" });
        return JSON.stringify(analysis);
      }
      case "get_stats": {
        const stats = await db.video.aggregate({
          _sum: {
            videoViews: true, likes: true, comments: true, shares: true, saves: true,
          },
          _avg: {
            duration: true, likeRate: true, commentRate: true, shareRate: true,
          },
          _count: true,
        });
        return JSON.stringify({
          count: stats._count,
          totalViews: stats._sum.videoViews ?? 0,
          totalLikes: stats._sum.likes ?? 0,
          totalComments: stats._sum.comments ?? 0,
          totalShares: stats._sum.shares ?? 0,
          totalSaves: stats._sum.saves ?? 0,
          avgDuration: stats._avg.duration ?? 0,
          avgLikeRate: stats._avg.likeRate ?? 0,
          avgCommentRate: stats._avg.commentRate ?? 0,
          avgShareRate: stats._avg.shareRate ?? 0,
        });
      }
      case "create_video": {
        const data: Record<string, unknown> = { videoUrl: args.videoUrl, source: "ai", processingStatus: "completed" };
        const allowedKeys = [
          "description", "authorUsername", "videoViews", "likes", "comments",
          "shares", "saves", "duration", "soundName", "ocrTitle", "transcript",
        ];
        for (const k of allowedKeys) {
          if (args[k] !== undefined) data[k] = args[k];
        }
        if (args.publishDate) data.publishDate = new Date(args.publishDate as string);
        if (args.hashtags) data.hashtags = JSON.stringify(args.hashtags);

        // Compute derived rates
        const views = (data.videoViews as number) ?? 0;
        if (views > 0) {
          const likes = (data.likes as number) ?? 0;
          const comments = (data.comments as number) ?? 0;
          const shares = (data.shares as number) ?? 0;
          data.likeRate = Math.round((likes / views) * 10000) / 100;
          data.commentRate = Math.round((comments / views) * 10000) / 100;
          data.shareRate = Math.round((shares / views) * 10000) / 100;
        }
        const created = await db.video.create({ data: data as never });
        return JSON.stringify({ ok: true, id: created.id });
      }
      case "update_video": {
        const { id, fields } = args as { id: string; fields: Record<string, unknown> };
        const data: Record<string, unknown> = { ...fields };

        // JSON-stringify hashtags if provided as array
        if (data.hashtags !== undefined && data.hashtags !== null && typeof data.hashtags !== "string") {
          data.hashtags = JSON.stringify(data.hashtags);
        }
        if (data.publishDate && typeof data.publishDate === "string") {
          data.publishDate = new Date(data.publishDate);
        }

        // Recompute rates if raw metrics changed
        const rawKeys = ["videoViews", "likes", "comments", "shares"];
        if (rawKeys.some((k) => data[k] !== undefined)) {
          const existing = await db.video.findUnique({ where: { id } });
          if (existing) {
            const v = (data.videoViews as number) ?? existing.videoViews ?? 0;
            const likes = (data.likes as number) ?? existing.likes ?? 0;
            const comments = (data.comments as number) ?? existing.comments ?? 0;
            const shares = (data.shares as number) ?? existing.shares ?? 0;
            if (v > 0) {
              data.likeRate = Math.round((likes / v) * 10000) / 100;
              data.commentRate = Math.round((comments / v) * 10000) / 100;
              data.shareRate = Math.round((shares / v) * 10000) / 100;
            }
          }
        }
        const updated = await db.video.update({ where: { id }, data: data as never });
        return JSON.stringify({ ok: true, id: updated.id });
      }
      case "delete_video": {
        await db.video.delete({ where: { id: args.id as string } });
        return JSON.stringify({ ok: true });
      }
      default:
        return JSON.stringify({ error: `Tool desconhecida: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

interface ChatRequestBody {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export async function POST(req: NextRequest) {
  try {
    if (!isNimAvailable()) {
      return NextResponse.json({
        reply:
          "NVIDIA_NIM_API_KEY não configurada. Defina a variável de ambiente com sua chave gratuita em https://build.nvidia.com (criar conta, selecionar modelo, gerar API key).",
        toolCalls: [],
      });
    }

    const { message, history = [] } = (await req.json()) as ChatRequestBody;

    const messages: NimChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((h) => ({ role: h.role, content: h.content } as NimChatMessage)),
      { role: "user", content: message },
    ];

    const toolCallLog: Array<{ name: string; args: unknown; result: unknown }> = [];
    let iterations = 0;
    let finalReply = "";
    const MAX_ITERATIONS = 8;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const res = await nimChat({ messages, tools: TOOLS, temperature: 0.4, max_tokens: 2000 });
      const choice = res.choices[0];
      const msg = choice.message;

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        messages.push({
          role: "assistant",
          content: msg.content ?? "",
          tool_calls: msg.tool_calls,
        });

        for (const tc of msg.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
          } catch {
            args = {};
          }
          const result = await executeTool(tc.function.name, args);
          const parsedResult = (() => { try { return JSON.parse(result); } catch { return result; } })();
          toolCallLog.push({ name: tc.function.name, args, result: parsedResult });
          messages.push({
            role: "tool",
            content: result,
            tool_call_id: tc.id,
            name: tc.function.name,
          });
        }
        continue;
      }

      finalReply = msg.content ?? "";
      break;
    }

    if (!finalReply) {
      finalReply = "Concluído. Veja as ações executadas acima.";
    }

    return NextResponse.json({ reply: finalReply, toolCalls: toolCallLog });
  } catch (err) {
    console.error("POST /api/chat error:", err);
    return NextResponse.json(
      { reply: `Erro: ${err instanceof Error ? err.message : String(err)}`, toolCalls: [] },
      { status: 500 }
    );
  }
}
