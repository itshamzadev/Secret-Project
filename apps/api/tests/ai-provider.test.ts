import { describe, expect, it, vi } from "vitest";

import { GeminiProvider } from "../src/modules/ai/ai.provider.js";

describe("Gemini provider streaming", () => {
  it("parses streamed SSE chunks without losing whitespace", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n' +
            'data: {"candidates":[{"content":{"parts":[{"text":" world"}]}}]}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
      );
    const provider = new GeminiProvider(
      "server-only-test-key",
      "gemini-3.7-flash",
      fetchMock,
    );
    const chunks: string[] = [];
    for await (const chunk of provider.stream({
      query: "Say hello",
      systemInstruction: "Be concise.",
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hello", " world"]);
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(requestInit?.headers).toEqual(
      expect.objectContaining({ "x-goog-api-key": "server-only-test-key" }),
    );
    expect(String(requestInit?.body)).toContain("system_instruction");
  });
});
