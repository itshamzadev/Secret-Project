import { describe, expect, it } from "vitest";

import type {
  AiProvider,
  AiProviderInput,
  AiProviderResult,
} from "../src/modules/ai/ai.provider.js";
import {
  createWebSearchProvider,
  normalizeResults,
} from "../src/modules/search/search.provider.js";

class FakeGeminiProvider implements AiProvider {
  public readonly inputs: AiProviderInput[] = [];
  public shouldFail = false;

  public async generate(input: AiProviderInput): Promise<AiProviderResult> {
    this.inputs.push(input);
    if (this.shouldFail) throw new Error("provider unavailable");
    return {
      answer: "Grounded answer",
      providerModel: "test-model",
      grounded: true,
      sources: [
        {
          title: "Example",
          snippet: "A real citation snippet.",
          url: "https://example.com/article",
          source: "example.com",
        },
        {
          title: "Duplicate",
          url: "https://example.com/article",
          source: "example.com",
        },
      ],
    };
  }

  public async *stream(
    _input: AiProviderInput,
  ): AsyncGenerator<string, void, undefined> {
    yield "unused";
  }
}

describe("Google-grounded web search provider", () => {
  it("uses Gemini with the built-in Google Search tool", async () => {
    const gemini = new FakeGeminiProvider();
    const provider = createWebSearchProvider(gemini);

    await expect(provider.search("latest AI news")).resolves.toMatchObject({
      answer: "Grounded answer",
      sources: [{ url: "https://example.com/article" }],
      results: [
        {
          title: "Example",
          snippet: "A real citation snippet.",
          url: "https://example.com/article",
          source: "example.com",
        },
      ],
    });
    expect(gemini.inputs).toHaveLength(1);
    expect(gemini.inputs[0]?.googleSearch).toBe(true);
  });

  it("drops malformed URLs and never fabricates source URLs", () => {
    expect(
      normalizeResults([
        { title: "Safe", url: "https://example.com", source: "example.com" },
        { title: "Unsafe", url: "javascript:alert(1)", source: "unsafe" },
        { title: "Missing", url: "not-a-url", source: "missing" },
      ]),
    ).toEqual([
      { title: "Safe", url: "https://example.com/", source: "example.com" },
    ]);
  });

  it("does not expose a fallback provider when Gemini is unavailable", async () => {
    const provider = createWebSearchProvider(null);
    expect(provider.name).toBe("google");
    await expect(provider.search("outage")).rejects.toMatchObject({
      code: "WEB_SEARCH_NOT_CONFIGURED",
      statusCode: 503,
    });
  });

  it("returns a retryable error when Gemini search fails", async () => {
    const gemini = new FakeGeminiProvider();
    gemini.shouldFail = true;
    await expect(
      createWebSearchProvider(gemini).search("outage"),
    ).rejects.toMatchObject({
      code: "WEB_SEARCH_PROVIDER_ERROR",
      statusCode: 502,
    });
  });
});
