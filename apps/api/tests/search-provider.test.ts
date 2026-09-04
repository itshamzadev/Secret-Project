import { afterEach, describe, expect, it, vi } from "vitest";

import { createWebSearchProvider } from "../src/modules/search/search.provider.js";

describe("Wikipedia web search provider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("normalizes safe result fields and strips snippets", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          query: {
            search: [
              {
                title: "JavaScript",
                snippet: "<span>Language</span> &quot;web&quot;",
                pageid: 42,
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const provider = createWebSearchProvider();
    expect(provider.name).toBe("wikipedia");
    await expect(provider.search("javascript")).resolves.toEqual([
      {
        title: "JavaScript",
        snippet: 'Language "web"',
        url: "https://en.wikipedia.org/?curid=42",
        source: "wikipedia.org",
      },
    ]);
  });

  it("turns provider failures into a safe application error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 503 }),
    );
    await expect(
      createWebSearchProvider().search("outage"),
    ).rejects.toMatchObject({
      code: "WEB_SEARCH_PROVIDER_ERROR",
      statusCode: 502,
    });
  });
});
