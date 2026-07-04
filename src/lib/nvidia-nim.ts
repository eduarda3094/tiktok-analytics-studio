/**
 * NVIDIA NIM API client
 * Docs: https://docs.api.nvidia.com
 *
 * Supports:
 *  - Chat completions (OpenAI-compatible) with tool/function calling
 *  - Audio transcriptions (ASR) via parakeet model
 *
 * Requires NVIDIA_NIM_API_KEY env var. If absent, falls back to a
 * graceful error so the UI keeps working but AI features return a message.
 */

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";

export const NIM_MODELS = {
  chat: [
    "meta/llama-3.3-70b-instruct",
    "meta/llama-3.1-70b-instruct",
    "meta/llama-3.1-405b-instruct",
    "nvidia/llama-3.1-nemotron-70b-instruct",
    "mistralai/mixtral-8x22b-instruct-v0.1",
    "deepseek-ai/deepseek-r1",
  ],
  asr: [
    "nvidia/parakeet-ctc-1.1b-asr",
    "nvidia/parakeet-rnnt-1.1b-asr",
  ],
} as const;

export function getNimApiKey(): string | null {
  const key = process.env.NVIDIA_NIM_API_KEY;
  if (!key || key.trim() === "") return null;
  return key.trim();
}

export function isNimAvailable(): boolean {
  return getNimApiKey() !== null;
}

export interface NimChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: NimToolCall[];
  name?: string;
}

export interface NimToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface NimTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface NimChatOptions {
  model?: string;
  messages: NimChatMessage[];
  tools?: NimTool[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface NimChatResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: NimToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * Non-streaming chat completion. Throws Error with a friendly message if no API key.
 */
export async function nimChat(opts: NimChatOptions): Promise<NimChatResponse> {
  const key = getNimApiKey();
  if (!key) {
    throw new Error(
      "NVIDIA_NIM_API_KEY não configurada. Defina a variável de ambiente com sua chave da NVIDIA NIM (https://build.nvidia.com)."
    );
  }

  const model = opts.model ?? NIM_MODELS.chat[0];
  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.6,
    max_tokens: opts.max_tokens ?? 2048,
    stream: false,
  };
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(`${NIM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`NVIDIA NIM chat falhou (${res.status}): ${errText.slice(0, 500)}`);
  }
  return (await res.json()) as NimChatResponse;
}

/**
 * Streaming chat completion. Yields delta content strings.
 * Tool calls are not supported in streaming mode here (kept simple).
 */
export async function* nimChatStream(opts: NimChatOptions): AsyncGenerator<string> {
  const key = getNimApiKey();
  if (!key) {
    throw new Error(
      "NVIDIA_NIM_API_KEY não configurada. Defina a variável de ambiente com sua chave da NVIDIA NIM."
    );
  }
  const model = opts.model ?? NIM_MODELS.chat[0];
  const res = await fetch(`${NIM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.6,
      max_tokens: opts.max_tokens ?? 2048,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`NVIDIA NIM stream falhou (${res.status}): ${errText.slice(0, 500)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta as string;
      } catch {
        // ignore parse errors on partial chunks
      }
    }
  }
}

/**
 * Audio transcription via NVIDIA NIM (parakeet ASR model).
 * Accepts an audio/video file path or Buffer + mime type.
 * Returns the transcribed text.
 */
export async function nimTranscribe(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  const key = getNimApiKey();
  if (!key) {
    throw new Error("NVIDIA_NIM_API_KEY não configurada para transcrição ASR.");
  }

  const form = new FormData();
  const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
  form.append("file", blob, filename);
  form.append("model", NIM_MODELS.asr[0]);
  form.append("language", "pt");
  form.append("response_format", "text");

  const res = await fetch(`${NIM_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`NVIDIA NIM ASR falhou (${res.status}): ${errText.slice(0, 500)}`);
  }
  const result = await res.text();
  // response_format=text returns plain text; json returns { text: "..." }
  try {
    const parsed = JSON.parse(result);
    return parsed.text ?? result;
  } catch {
    return result;
  }
}
