import { logger } from "../../logging/logger.js";
import { KnowledgeSearchCache } from "./search.cache.js";
import { createWebSearchProvider } from "./search.provider.js";
import { normalizeKnowledgeQuery } from "./search.query.js";
import { searchRules } from "./search.rules.js";
import type { WebSearchProvider, WebSearchResponseData } from "./types.js";
import type { WebSearchQuery } from "./search.validation.js";

export class SearchService {
  public constructor(private readonly provider: WebSearchProvider = createWebSearchProvider(), private readonly cache = new KnowledgeSearchCache<WebSearchResponseData>(searchRules.cacheTtlSeconds)) {}
  public async searchWeb(query: WebSearchQuery): Promise<WebSearchResponseData> {
    const normalized = normalizeKnowledgeQuery(query.q); const key = `terqivo:knowledge-search:en:${query.page}:${encodeURIComponent(normalized.toLocaleLowerCase("en-US"))}`;
    const cached = await this.cache.get(key);
    if (cached !== null) return { ...cached, query: normalized };
    const result = await this.provider.search(normalized, query.page);
    const response: WebSearchResponseData = { query: normalized, provider: this.provider.name, page: query.page, results: result.results };
    await this.cache.set(key, response);
    logger.info({ route: "knowledge", provider: this.provider.name, page: query.page, resultCount: response.results.length }, "Web search completed");
    return response;
  }
}
