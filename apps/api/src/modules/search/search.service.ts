import type { WebSearchResponseData } from "@terqivo/contracts";

import { logger } from "../../lib/logger.js";
import { KnowledgeSearchCache } from "./search.cache.js";
import { createWebSearchProvider } from "./search.provider.js";
import type { WebSearchProvider } from "./search.provider.js";
import { normalizeKnowledgeQuery } from "./search.query.js";
import { searchRules } from "./search.rules.js";
import type { WebSearchQuery } from "./search.validation.js";

const searchCache = new KnowledgeSearchCache<WebSearchResponseData>(
  searchRules.cacheTtlSeconds,
);
const defaultProvider = createWebSearchProvider();

export async function searchWeb(
  query: WebSearchQuery,
  provider: WebSearchProvider = defaultProvider,
): Promise<WebSearchResponseData> {
  const startedAt = Date.now();
  const normalizedQuery = normalizeKnowledgeQuery(query.q);
  const page = query.page;
  const cacheKey = `terqivo:knowledge-search:en:${page}:${encodeURIComponent(
    normalizedQuery.toLocaleLowerCase("en-US"),
  )}`;
  const cached = await searchCache.get(cacheKey);
  if (cached !== null) {
    logger.info(
      {
        route: "knowledge",
        provider: "terqivo",
        status: "completed",
        cacheHit: true,
        searchTotalMs: Math.max(0, Date.now() - startedAt),
        resultCount: cached.results.length,
        page,
      },
      "Web search completed",
    );
    return { ...cached, query: normalizedQuery };
  }

  logger.info(
    {
      route: "knowledge",
      provider: "terqivo",
      status: "processing",
      queryLength: normalizedQuery.length,
      page,
    },
    "Web search requested",
  );
  try {
    const result = await provider.search(normalizedQuery, page);
    const response: WebSearchResponseData = {
      query: normalizedQuery,
      provider: provider.name,
      page,
      results: result.results,
    };
    await searchCache.set(cacheKey, response);
    logger.info(
      {
        route: "knowledge",
        provider: "terqivo",
        status: "completed",
        cacheHit: false,
        searchTotalMs: Math.max(0, Date.now() - startedAt),
        resultCount: response.results.length,
        page,
      },
      "Web search completed",
    );
    return response;
  } catch (error: unknown) {
    logger.warn(
      {
        route: "knowledge",
        provider: "terqivo",
        status: "failed",
        searchTotalMs: Math.max(0, Date.now() - startedAt),
      },
      "Web search failed",
    );
    throw error;
  }
}
