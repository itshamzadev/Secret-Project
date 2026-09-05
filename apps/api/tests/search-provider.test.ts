import { describe, expect, it, vi } from "vitest";

import {
  createWebSearchProvider,
  cleanSearchText,
  WikipediaKnowledgeSearchProvider,
} from "../src/modules/search/search.provider.js";
import { buildSearchVariants } from "../src/modules/search/search.query.js";
import {
  filterKnowledgeCandidates,
  rankKnowledgeCandidates,
} from "../src/modules/search/search.rank.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Terqivo Knowledge Search provider", () => {
  it("uses Wikimedia search, enriches pages in one batch, and returns truthful sources", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const params = new URL(String(input)).searchParams;
        if (params.get("list") === "search") {
          return jsonResponse({
            query: {
              search: [
                {
                  pageid: 1,
                  ns: 0,
                  index: 1,
                  title: "Ada Lovelace",
                  snippet:
                    '<span class="searchmatch">Ada</span> Lovelace was a mathematician.',
                },
                {
                  pageid: 2,
                  ns: 0,
                  index: 2,
                  title: "Ada Lovelace (disambiguation)",
                  snippet: "Ada may refer to several topics.",
                },
              ],
            },
          });
        }
        return jsonResponse({
          query: {
            pages: [
              {
                pageid: 1,
                title: "Ada Lovelace",
                fullurl: "https://en.wikipedia.org/wiki/Ada_Lovelace",
                extract:
                  "Ada Lovelace was an English mathematician and writer.",
                thumbnail: {
                  source: "https://upload.wikimedia.org/ada.jpg",
                },
              },
              {
                pageid: 2,
                title: "Ada Lovelace (disambiguation)",
                fullurl:
                  "https://en.wikipedia.org/wiki/Ada_Lovelace_(disambiguation)",
              },
            ],
          },
        });
      });
    const provider = new WikipediaKnowledgeSearchProvider(
      fetchMock,
      "https://wikipedia.test/w/api.php",
    );

    await expect(
      provider.search("  who   is Ada Lovelace? ", 2),
    ).resolves.toEqual({
      results: [
        {
          position: 1,
          title: "Ada Lovelace",
          url: "https://en.wikipedia.org/wiki/Ada_Lovelace",
          displayUrl: "en.wikipedia.org",
          source: "Wikipedia",
          snippet: "Ada Lovelace was an English mathematician and writer.",
          thumbnail: "https://upload.wikimedia.org/ada.jpg",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const requests = fetchMock.mock.calls.map(
      ([input]) => new URL(String(input)),
    );
    const searchRequests = requests.filter(
      (request) => request.searchParams.get("list") === "search",
    );
    expect(
      searchRequests.map((request) => request.searchParams.get("srsearch")),
    ).toEqual(["Ada Lovelace", "who is Ada Lovelace"]);
    expect(searchRequests[0]?.searchParams.get("sroffset")).toBe("10");
    expect(searchRequests[0]?.searchParams.get("srnamespace")).toBe("0");

    const enrichment = requests.find(
      (request) => request.searchParams.get("pageids") !== null,
    );
    expect(enrichment?.searchParams.get("pageids")).toBe("1");
    const headers = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(new Headers(headers).get("user-agent")).toContain("TerqivoConnect");
  });

  it("requires no provider key and creates the free Wikimedia provider", () => {
    expect(createWebSearchProvider()).toBeInstanceOf(
      WikipediaKnowledgeSearchProvider,
    );
  });

  it("normalizes intent queries into a limited entity-first variant list", () => {
    expect(buildSearchVariants("  who   is ItsHamzaDev? ")).toEqual([
      "ItsHamzaDev",
      "who is ItsHamzaDev",
    ]);
    expect(buildSearchVariants('"React hooks"')).toEqual(['"React hooks"']);
  });

  it("ranks exact titles above weaker matches and removes duplicate pages", () => {
    const ranked = rankKnowledgeCandidates(
      filterKnowledgeCandidates(
        [
          {
            pageId: 3,
            namespace: 0,
            position: 1,
            title: "Ada Lovelace (disambiguation)",
            snippet: "Ada may refer to several topics.",
          },
          {
            pageId: 1,
            namespace: 0,
            position: 2,
            title: "Ada Lovelace",
            snippet: "A mathematician.",
          },
          {
            pageId: 1,
            namespace: 0,
            position: 3,
            title: "Ada Lovelace",
            snippet: "Duplicate variant result.",
          },
          {
            pageId: 4,
            namespace: 0,
            position: 1,
            title: "List of mathematicians",
            snippet: "A list.",
          },
        ],
        "Ada Lovelace",
      ),
      "Ada Lovelace",
    );

    expect(ranked[0]?.title).toBe("Ada Lovelace");
    expect(ranked).toHaveLength(1);
  });

  it("filters blocked namespaces and keeps a disambiguation only as a last resort", () => {
    expect(
      filterKnowledgeCandidates(
        [
          { pageId: 1, namespace: 1, position: 1, title: "Talk:Ada" },
          { pageId: 2, namespace: 0, position: 2, title: "Category:People" },
          {
            pageId: 3,
            namespace: 0,
            position: 3,
            title: "Ada (disambiguation)",
            snippet: "may refer to",
          },
        ],
        "Ada",
      ),
    ).toEqual([
      {
        pageId: 3,
        namespace: 0,
        position: 3,
        title: "Ada (disambiguation)",
        snippet: "may refer to",
      },
    ]);
  });

  it("strips search markup, decodes entities, and trims long snippets", () => {
    const cleaned = cleanSearchText(
      '<span class="searchmatch">Ada</span> &amp; mathematicians ' +
        "with a very long explanation that should be shortened without exposing markup or entities.",
    );
    expect(cleaned).toContain("Ada & mathematicians");
    expect(cleaned).not.toContain("searchmatch");
    expect(cleaned?.length).toBeLessThanOrEqual(241);
  });

  it("filters malformed page URLs without fabricating replacements", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const params = new URL(String(input)).searchParams;
        return params.get("list") === "search"
          ? jsonResponse({
              query: {
                search: [
                  { pageid: 1, ns: 0, index: 1, title: "Safe" },
                  { pageid: 2, ns: 0, index: 2, title: "Unsafe" },
                ],
              },
            })
          : jsonResponse({
              query: {
                pages: [
                  {
                    pageid: 1,
                    title: "Safe",
                    fullurl: "https://en.wikipedia.org/wiki/Safe",
                  },
                  {
                    pageid: 2,
                    title: "Unsafe",
                    fullurl: "javascript:alert(1)",
                  },
                ],
              },
            });
      });
    const provider = new WikipediaKnowledgeSearchProvider(fetchMock);

    await expect(provider.search("safe", 1)).resolves.toEqual({
      results: [
        expect.objectContaining({
          title: "Safe",
          url: "https://en.wikipedia.org/wiki/Safe",
        }),
      ],
    });
  });

  it("returns an empty result for a valid empty Wikimedia response", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ query: { search: [] } }));
    const provider = new WikipediaKnowledgeSearchProvider(fetchMock);

    await expect(provider.search("nothing", 1)).resolves.toEqual({
      results: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps upstream, invalid JSON, and timeout failures to a clean retryable error", async () => {
    for (const fetchMock of [
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ error: { code: "bad" } }, 503)),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("not json", { status: 200 })),
      vi.fn<typeof fetch>().mockRejectedValue(new Error("timed out")),
    ]) {
      const provider = new WikipediaKnowledgeSearchProvider(fetchMock);
      await expect(provider.search("query", 1)).rejects.toMatchObject({
        code: "WEB_SEARCH_PROVIDER_ERROR",
        statusCode: 502,
      });
    }
  });
});
