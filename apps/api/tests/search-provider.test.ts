import { describe, expect, it, vi } from "vitest";

import {
  createWebSearchProvider,
  normalizeOrganicResults,
  SerpApiGoogleSearchProvider,
} from "../src/modules/search/search.provider.js";

function serpApiResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("SerpApi Google web search provider", () => {
  it("calls SerpApi with Google, the query, and the requested page", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      serpApiResponse({
        search_metadata: { status: "Success" },
        organic_results: [
          {
            position: 1,
            title: "Example result",
            link: "https://example.com/article",
            displayed_link: "example.com › article",
            source: "Example",
            snippet: "A useful result.",
            favicon: "https://example.com/favicon.ico",
            thumbnail: "https://example.com/image.jpg",
          },
        ],
      }),
    );
    const provider = new SerpApiGoogleSearchProvider(
      "server-only-serpapi-test-key",
      fetchMock,
      "https://serpapi.test/search",
    );

    await expect(provider.search(" latest AI news ", 2)).resolves.toEqual({
      results: [
        {
          position: 1,
          title: "Example result",
          url: "https://example.com/article",
          displayUrl: "example.com › article",
          source: "Example",
          snippet: "A useful result.",
          favicon: "https://example.com/favicon.ico",
          thumbnail: "https://example.com/image.jpg",
        },
      ],
    });

    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    const params = new URL(requestUrl).searchParams;
    expect(params.get("engine")).toBe("google");
    expect(params.get("q")).toBe(" latest AI news ");
    expect(params.get("api_key")).toBe("server-only-serpapi-test-key");
    expect(params.get("output")).toBe("json");
    expect(params.get("google_domain")).toBe("google.com");
    expect(params.get("hl")).toBe("en");
    expect(params.get("gl")).toBe("pk");
    expect(params.get("start")).toBe("10");
    expect(JSON.stringify({ results: [] })).not.toContain(
      "server-only-serpapi-test-key",
    );
  });

  it("maps organic results without requiring optional fields", () => {
    expect(
      normalizeOrganicResults([
        {
          title: "Minimal result",
          link: "https://example.com",
        },
        {
          title: "Invalid URL is removed",
          link: "javascript:alert(1)",
        },
        {
          link: "https://no-title.example/result",
        },
      ]),
    ).toEqual([
      {
        title: "Minimal result",
        url: "https://example.com/",
      },
      {
        url: "https://no-title.example/result",
      },
    ]);
  });

  it("filters invalid URLs and removes duplicate organic results", () => {
    expect(
      normalizeOrganicResults([
        { position: 1, title: "First", link: "https://example.com" },
        { position: 2, title: "Duplicate", link: "https://example.com/" },
        { position: 3, title: "Unsafe", link: "file:///private/file" },
        { position: 4, title: "Relative", link: "/relative" },
      ]),
    ).toEqual([{ position: 1, title: "First", url: "https://example.com/" }]);
  });

  it("maps SerpApi error responses to a clean retryable error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      serpApiResponse(
        {
          error: "Invalid API key",
          search_metadata: { status: "Error" },
        },
        401,
      ),
    );
    const provider = new SerpApiGoogleSearchProvider(
      "server-only-serpapi-test-key",
      fetchMock,
      "https://serpapi.test/search",
    );

    await expect(provider.search("query", 1)).rejects.toMatchObject({
      code: "WEB_SEARCH_PROVIDER_ERROR",
      statusCode: 502,
    });
  });

  it("maps SerpApi quota/rate-limit responses to a clean retryable error", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        serpApiResponse({ error: "Monthly searches exhausted" }, 429),
      );
    const provider = new SerpApiGoogleSearchProvider(
      "server-only-serpapi-test-key",
      fetchMock,
      "https://serpapi.test/search",
    );

    await expect(provider.search("query", 1)).rejects.toMatchObject({
      code: "WEB_SEARCH_PROVIDER_ERROR",
      statusCode: 502,
    });
  });

  it("maps invalid upstream JSON to a clean retryable error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("not json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = new SerpApiGoogleSearchProvider(
      "server-only-serpapi-test-key",
      fetchMock,
      "https://serpapi.test/search",
    );

    await expect(provider.search("query", 1)).rejects.toMatchObject({
      code: "WEB_SEARCH_PROVIDER_ERROR",
      statusCode: 502,
    });
  });

  it("maps timeout/network failures to a clean retryable error", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("timed out"));
    const provider = new SerpApiGoogleSearchProvider(
      "server-only-serpapi-test-key",
      fetchMock,
      "https://serpapi.test/search",
    );

    await expect(provider.search("query", 1)).rejects.toMatchObject({
      code: "WEB_SEARCH_PROVIDER_ERROR",
      statusCode: 502,
    });
  });

  it("returns a configuration error when SerpApi is not configured", async () => {
    const provider = createWebSearchProvider(undefined);

    expect(provider).not.toBeInstanceOf(SerpApiGoogleSearchProvider);
    await expect(provider.search("query", 1)).rejects.toMatchObject({
      code: "WEB_SEARCH_NOT_CONFIGURED",
      statusCode: 503,
    });
  });
});
