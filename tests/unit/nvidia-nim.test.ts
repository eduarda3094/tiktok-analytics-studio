/**
 * Unit tests for NVIDIA NIM client (src/lib/nvidia-nim.ts)
 *
 * Tests API key handling, request building, and response parsing
 * without making real network calls (uses fetch mock).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("NVIDIA NIM client", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NVIDIA_NIM_API_KEY;
  });

  afterEach(() => {
    process.env.NVIDIA_NIM_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  describe("getNimApiKey / isNimAvailable", () => {
    it("returns null when NVIDIA_NIM_API_KEY is not set", async () => {
      delete process.env.NVIDIA_NIM_API_KEY;
      const { getNimApiKey, isNimAvailable } = await import("@/lib/nvidia-nim");
      expect(getNimApiKey()).toBeNull();
      expect(isNimAvailable()).toBe(false);
    });

    it("returns null when NVIDIA_NIM_API_KEY is empty string", async () => {
      process.env.NVIDIA_NIM_API_KEY = "";
      const { getNimApiKey, isNimAvailable } = await import("@/lib/nvidia-nim");
      expect(getNimApiKey()).toBeNull();
      expect(isNimAvailable()).toBe(false);
    });

    it("returns null when NVIDIA_NIM_API_KEY is only whitespace", async () => {
      process.env.NVIDIA_NIM_API_KEY = "   ";
      const { getNimApiKey, isNimAvailable } = await import("@/lib/nvidia-nim");
      expect(getNimApiKey()).toBeNull();
      expect(isNimAvailable()).toBe(false);
    });

    it("returns the key when NVIDIA_NIM_API_KEY is set", async () => {
      process.env.NVIDIA_NIM_API_KEY = "nvapi-test-key-123";
      const { getNimApiKey, isNimAvailable } = await import("@/lib/nvidia-nim");
      expect(getNimApiKey()).toBe("nvapi-test-key-123");
      expect(isNimAvailable()).toBe(true);
    });

    it("trims whitespace from the key", async () => {
      process.env.NVIDIA_NIM_API_KEY = "  nvapi-test-key-123  \n";
      const { getNimApiKey } = await import("@/lib/nvidia-nim");
      expect(getNimApiKey()).toBe("nvapi-test-key-123");
    });
  });

  describe("NIM_MODELS", () => {
    it("exposes chat models list", async () => {
      const { NIM_MODELS } = await import("@/lib/nvidia-nim");
      expect(NIM_MODELS.chat).toBeInstanceOf(Array);
      expect(NIM_MODELS.chat.length).toBeGreaterThan(0);
      expect(NIM_MODELS.chat).toContain("meta/llama-3.3-70b-instruct");
    });

    it("exposes ASR models list", async () => {
      const { NIM_MODELS } = await import("@/lib/nvidia-nim");
      expect(NIM_MODELS.asr).toBeInstanceOf(Array);
      expect(NIM_MODELS.asr.length).toBeGreaterThan(0);
    });

    it("chat models are strings in the format 'vendor/model'", async () => {
      const { NIM_MODELS } = await import("@/lib/nvidia-nim");
      for (const m of NIM_MODELS.chat) {
        expect(typeof m).toBe("string");
        expect(m).toMatch(/^[a-z0-9_-]+\/[a-z0-9._-]+$/i);
      }
    });
  });

  describe("nimChat", () => {
    it("throws friendly error when no API key is set", async () => {
      delete process.env.NVIDIA_NIM_API_KEY;
      const { nimChat } = await import("@/lib/nvidia-nim");
      await expect(nimChat({ messages: [] })).rejects.toThrow(/NVIDIA_NIM_API_KEY não configurada/);
    });

    it("sends POST to NIM endpoint with correct headers when API key is set", async () => {
      process.env.NVIDIA_NIM_API_KEY = "nvapi-test-key-123";
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: "test-id",
          model: "meta/llama-3.3-70b-instruct",
          choices: [{
            index: 0,
            message: { role: "assistant", content: "Hello!" },
            finish_reason: "stop",
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }), { status: 200, headers: { "Content-Type": "application/json" } })
      );

      const { nimChat } = await import("@/lib/nvidia-nim");
      const result = await nimChat({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
      expect((init as RequestInit).method).toBe("POST");
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer nvapi-test-key-123");
      expect(headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.model).toBe("meta/llama-3.3-70b-instruct");
      expect(body.messages).toEqual([{ role: "user", content: "Hi" }]);

      expect(result.choices[0].message.content).toBe("Hello!");
    });

    it("includes tools in body when provided", async () => {
      process.env.NVIDIA_NIM_API_KEY = "nvapi-test-key";
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: "x",
          model: "x",
          choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        }), { status: 200, headers: { "Content-Type": "application/json" } })
      );

      const { nimChat } = await import("@/lib/nvidia-nim");
      const tools = [{
        type: "function" as const,
        function: {
          name: "test_tool",
          description: "A test tool",
          parameters: { type: "object", properties: {} },
        },
      }];

      await nimChat({ messages: [], tools });
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.tools).toEqual(tools);
      expect(body.tool_choice).toBe("auto");
    });

    it("throws on HTTP error", async () => {
      process.env.NVIDIA_NIM_API_KEY = "nvapi-test-key";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Forbidden", { status: 403 })
      );

      const { nimChat } = await import("@/lib/nvidia-nim");
      await expect(nimChat({ messages: [] })).rejects.toThrow(/NVIDIA NIM chat falhou \(403\)/);
    });
  });

  describe("nimTranscribe", () => {
    it("throws when no API key is set", async () => {
      delete process.env.NVIDIA_NIM_API_KEY;
      const { nimTranscribe } = await import("@/lib/nvidia-nim");
      await expect(nimTranscribe(Buffer.from(""), "audio.mp3", "audio/mpeg"))
        .rejects.toThrow(/NVIDIA_NIM_API_KEY não configurada/);
    });

    it("sends multipart form to /audio/transcriptions", async () => {
      process.env.NVIDIA_NIM_API_KEY = "nvapi-test";
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("transcribed text here", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        })
      );

      const { nimTranscribe } = await import("@/lib/nvidia-nim");
      const result = await nimTranscribe(Buffer.from("audio-data"), "audio.mp3", "audio/mpeg");

      expect(result).toBe("transcribed text here");
      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://integrate.api.nvidia.com/v1/audio/transcriptions");
      expect((init as RequestInit).method).toBe("POST");
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer nvapi-test");
    });

    it("parses JSON response when API returns JSON", async () => {
      process.env.NVIDIA_NIM_API_KEY = "nvapi-test";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ text: "json response text" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const { nimTranscribe } = await import("@/lib/nvidia-nim");
      const result = await nimTranscribe(Buffer.from("audio"), "audio.mp3", "audio/mpeg");
      expect(result).toBe("json response text");
    });
  });
});
