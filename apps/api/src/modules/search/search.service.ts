import type { WebSearchResponseData } from "@terqivo/contracts";

import { logger } from "../../lib/logger.js";
import { AiResponseCache } from "../ai/ai.cache.js";
import { createWebSearchProvider } from "./search.provider.js";
import type { WebSearchProvider } from "./search.provider.js";
import type { WebSearchQuery } from "./search.validation.js";

const searchCache = new AiResponseCache<WebSearchResponseData>(3 * 60_000);
const defaultProvider = createWebSearchProvider();

export async function searchWeb(
  query: WebSearchQuery,
  provider: WebSearchProvider = defaultProvider,
): Promise<WebSearchResponseData> {
  const startedAt = Date.now();
  const normalizedQuery = query.q.trim();
  const cacheKey = `google:${normalizedQuery.toLocaleLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached !== null) {
    logger.info(
      {
        route: "google",
        status: "completed",
        cacheHit: true,
        searchTotalMs: Math.max(0, Date.now() - startedAt),
        resultCount: cached.results.length,
      },
      "Web search completed",
    );
    return { ...cached, query: normalizedQuery };
  }

  logger.info(
    {
      route: "google",
      status: "processing",
      queryLength: normalizedQuery.length,
    },
    "Web search requested",
  );
  try {
    const result = await provider.search(normalizedQuery);
    const response: WebSearchResponseData = {
      query: normalizedQuery,
      provider: provider.name,
      answer: result.answer,
      results: result.results,
      sources: result.sources,
    };
    searchCache.set(cacheKey, response);
    logger.info(
      {
        route: "google",
        status: "completed",
        cacheHit: false,
        searchTotalMs: Math.max(0, Date.now() - startedAt),
        resultCount: response.results.length,
      },
      "Web search completed",
    );
    return response;
  } catch (error: unknown) {
    logger.warn(
      {
        route: "google",
        status: "failed",
        searchTotalMs: Math.max(0, Date.now() - startedAt),
      },
      "Web search failed",
    );
    throw error;
  }
}
