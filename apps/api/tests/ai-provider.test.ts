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

describe("Gemini Google Search grounding", () => {
  it("sends the built-in tool and extracts only grounded HTTP sources", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: "Grounded answer" }] },
              groundingMetadata: {
                groundingChunks: [
                  {
                    web: {
                      uri: "https://example.com/article",
                      title: "Example",
                    },
                  },
                  {
                    web: {
                      uri: "https://example.com/article",
                      title: "Duplicate",
                    },
                  },
                  { web: { uri: "javascript:alert(1)", title: "Unsafe" } },
                ],
                groundingSupports: [
                  {
                    segment: { text: "Example snippet" },
                    groundingChunkIndices: [0, 2],
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const provider = new GeminiProvider(
      "server-only-test-key",
      "gemini-3.7-flash",
      fetchMock,
    );

    const result = await provider.generate({
      query: "latest AI news",
      googleSearch: true,
    });

    expect(result).toMatchObject({
      answer: "Grounded answer",
      grounded: true,
      sources: [
        {
          title: "Example",
          snippet: "Example snippet",
          url: "https://example.com/article",
          source: "example.com",
        },
      ],
    });
    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as { tools?: unknown };
    expect(requestBody.tools).toEqual([{ google_search: {} }]);
    expect(JSON.stringify(result)).not.toContain("server-only-test-key");
  });

  it("turns request timeouts into a clean provider error", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(
        Object.assign(new Error("timed out"), { name: "AbortError" }),
      );
    const provider = new GeminiProvider(
      "server-only-test-key",
      "gemini-3.7-flash",
      fetchMock,
    );

    await expect(
      provider.generate({ query: "latest AI news", googleSearch: true }),
    ).rejects.toMatchObject({
      code: "AI_PROVIDER_ERROR",
      statusCode: 502,
    });
  });
});
