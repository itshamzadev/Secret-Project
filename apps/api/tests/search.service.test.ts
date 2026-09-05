import { describe, expect, it } from "vitest";

import { searchWeb } from "../src/modules/search/search.service.js";
import type { WebSearchProvider } from "../src/modules/search/search.provider.js";

class FakeSearchProvider implements WebSearchProvider {
  public readonly name = "google" as const;
  public calls = 0;

  public async search(): Promise<{
    answer: string;
    results: [];
    sources: [];
  }> {
    this.calls += 1;
    return {
      answer: "Grounded answer",
      results: [],
      sources: [],
    };
  }
}

describe("web search service", () => {
  it("returns the Google-grounded response contract", async () => {
    const provider = new FakeSearchProvider();
    const result = await searchWeb(
      { q: "  public search contract  " },
      provider,
    );

    expect(result).toEqual({
      query: "public search contract",
      provider: "google",
      answer: "Grounded answer",
      results: [],
      sources: [],
    });
  });

  it("caches identical public searches for the short configured TTL", async () => {
    const provider = new FakeSearchProvider();
    await searchWeb({ q: "  public cache contract  " }, provider);
    await searchWeb({ q: "PUBLIC CACHE CONTRACT" }, provider);

    expect(provider.calls).toBe(1);
  });
});
