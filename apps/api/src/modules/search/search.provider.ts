import type {
  WebSearchResultDto,
  WebSearchResponseData,
} from "@terqivo/contracts";

import { AppError } from "../../core/errors.js";
import {
  getConfiguredGeminiProvider,
  type AiProvider,
  type AiProviderResult,
} from "../ai/ai.provider.js";

export interface WebSearchProvider {
  readonly name: "google";
  search(
    query: string,
  ): Promise<Pick<WebSearchResponseData, "answer" | "results" | "sources">>;
}

class GoogleGroundedSearchProvider implements WebSearchProvider {
  public readonly name = "google" as const;

  public constructor(private readonly gemini: AiProvider) {}

  public async search(
    query: string,
  ): Promise<Pick<WebSearchResponseData, "answer" | "results" | "sources">> {
    let result: AiProviderResult;
    try {
      result = await this.gemini.generate({ query, googleSearch: true });
    } catch {
      throw searchProviderError();
    }

    const results = normalizeResults(result.sources ?? []);
    return {
      answer: result.answer,
      results,
      sources: results.map(({ title, url }) =>
        title === undefined ? { url } : { title, url },
      ),
    };
  }
}

class UnconfiguredGoogleSearchProvider implements WebSearchProvider {
  public readonly name = "google" as const;

  public search(): Promise<
    Pick<WebSearchResponseData, "answer" | "results" | "sources">
  > {
    return Promise.reject(
      new AppError({
        code: "WEB_SEARCH_NOT_CONFIGURED",
        message: "Web search is not configured yet.",
        statusCode: 503,
      }),
    );
  }
}

export function createWebSearchProvider(
  gemini: AiProvider | null = getConfiguredGeminiProvider(),
): WebSearchProvider {
  return gemini === null
    ? new UnconfiguredGoogleSearchProvider()
    : new GoogleGroundedSearchProvider(gemini);
}

export function normalizeResults(
  results: readonly WebSearchResultDto[],
): WebSearchResultDto[] {
  const normalized = new Map<string, WebSearchResultDto>();
  for (const result of results) {
    const url = safeHttpUrl(result.url);
    if (url === null || normalized.has(url)) continue;
    const item: WebSearchResultDto = {
      url,
      source: result.source.trim() || new URL(url).hostname,
    };
    if (result.title?.trim()) item.title = result.title.trim();
    if (result.snippet?.trim()) item.snippet = result.snippet.trim();
    normalized.set(url, item);
  }
  return [...normalized.values()];
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function searchProviderError(): AppError {
  return new AppError({
    code: "WEB_SEARCH_PROVIDER_ERROR",
    message: "The web search provider is temporarily unavailable.",
    statusCode: 502,
  });
}
