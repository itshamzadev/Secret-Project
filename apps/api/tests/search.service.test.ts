import { describe, expect, it } from "vitest";

import type { WebSearchResponseData } from "@terqivo/contracts";

import { searchWeb } from "../src/modules/search/search.service.js";
import type { WebSearchProvider } from "../src/modules/search/search.provider.js";

class FakeSearchProvider implements WebSearchProvider {
  public readonly name = "google" as const;
  public calls = 0;

  public async search(
    _query: string,
    _page: number,
  ): Promise<Pick<WebSearchResponseData, "results">> {
    this.calls += 1;
    return {
      results: [],
    };
  }
}

describe("web search service", () => {
  it("returns the normalized Google result contract", async () => {
    const provider = new FakeSearchProvider();
    const result = await searchWeb(
      { q: "  public search contract  ", page: 1 },
      provider,
    );

    expect(result).toEqual({
      query: "public search contract",
      provider: "google",
      page: 1,
      results: [],
    });
  });

  it("caches identical public searches for the short configured TTL", async () => {
    const provider = new FakeSearchProvider();
    await searchWeb({ q: "  public cache contract  ", page: 1 }, provider);
    await searchWeb({ q: "PUBLIC CACHE CONTRACT", page: 1 }, provider);

    expect(provider.calls).toBe(1);
  });
});
