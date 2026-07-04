/**
 * Unit tests for NVIDIA NIM streaming function (nimChatStream).
 * Tests the streaming chat completion generator.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("NVIDIA NIM nimChatStream", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.NVIDIA_NIM_API_KEY;
  });

  afterEach(() => {
    process.env.NVIDIA_NIM_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("throws when no API key is set", async () => {
    delete process.env.NVIDIA_NIM_API_KEY;
    const { nimChatStream } = await import("@/lib/nvidia-nim");

    async function collect() {
      const gen = nimChatStream({ messages: [] });
      for await (const chunk of gen) { /* collect */ }
    }

    await expect(collect()).rejects.toThrow(/NVIDIA_NIM_API_KEY não configurada/);
  });

  it("yields delta content from SSE stream", async () => {
    process.env.NVIDIA_NIM_API_KEY = "nvapi-test";

    // Mock fetch to return a ReadableStream with SSE data
    const encoder = new TextEncoder();
    const sseChunks = [
      encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'),
      encoder.encode('data: {"choices":[{"delta":{"content":" world"}}]}\n\n'),
      encoder.encode('data: [DONE]\n\n'),
    ];

    const mockStream = new ReadableStream({
      start(controller) {
        for (const chunk of sseChunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(mockStream, { status: 200 })
    );

    const { nimChatStream } = await import("@/lib/nvidia-nim");
    const chunks: string[] = [];
    for await (const delta of nimChatStream({ messages: [{ role: "user", content: "hi" }] })) {
      chunks.push(delta);
    }

    expect(chunks).toEqual(["Hello", " world"]);
  });

  it("handles empty SSE lines gracefully", async () => {
    process.env.NVIDIA_NIM_API_KEY = "nvapi-test";

    const encoder = new TextEncoder();
    const sseData = [
      encoder.encode('\n\n'),  // empty lines
      encoder.encode('data: {"choices":[{"delta":{"content":"A"}}]}\n\n'),
      encoder.encode(': comment\n\n'),  // SSE comment (starts with colon)
      encoder.encode('data: [DONE]\n\n'),
    ];

    const mockStream = new ReadableStream({
      start(controller) {
        for (const chunk of sseData) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(mockStream, { status: 200 })
    );

    const { nimChatStream } = await import("@/lib/nvidia-nim");
    const chunks: string[] = [];
    for await (const delta of nimChatStream({ messages: [] })) {
      chunks.push(delta);
    }

    expect(chunks).toEqual(["A"]);
  });

  it("stops at [DONE] sentinel", async () => {
    process.env.NVIDIA_NIM_API_KEY = "nvapi-test";

    const encoder = new TextEncoder();
    const sseData = [
      encoder.encode('data: {"choices":[{"delta":{"content":"X"}}]}\n\n'),
      encoder.encode('data: [DONE]\n\n'),
      encoder.encode('data: {"choices":[{"delta":{"content":"should-not-appear"}}]}\n\n'),
    ];

    const mockStream = new ReadableStream({
      start(controller) {
        for (const chunk of sseData) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(mockStream, { status: 200 })
    );

    const { nimChatStream } = await import("@/lib/nvidia-nim");
    const chunks: string[] = [];
    for await (const delta of nimChatStream({ messages: [] })) {
      chunks.push(delta);
    }

    expect(chunks).toEqual(["X"]);
    expect(chunks).not.toContain("should-not-appear");
  });

  it("throws on HTTP error", async () => {
    process.env.NVIDIA_NIM_API_KEY = "nvapi-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 })
    );

    const { nimChatStream } = await import("@/lib/nvidia-nim");

    async function collect() {
      for await (const _ of nimChatStream({ messages: [] })) { /* collect */ }
    }

    await expect(collect()).rejects.toThrow(/NVIDIA NIM stream falhou \(401\)/);
  });

  it("throws when response body is null", async () => {
    process.env.NVIDIA_NIM_API_KEY = "nvapi-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 200 })
    );

    const { nimChatStream } = await import("@/lib/nvidia-nim");

    async function collect() {
      for await (const _ of nimChatStream({ messages: [] })) { /* collect */ }
    }

    await expect(collect()).rejects.toThrow(/NVIDIA NIM stream falhou/);
  });
});
