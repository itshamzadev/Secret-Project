import type {
  WebSearchResponseData,
  WebSearchResultDto,
} from "@terqivo/contracts";

import { env } from "../../config/env.js";
import { AppError } from "../../core/errors.js";
import { logger } from "../../lib/logger.js";

export interface WebSearchProvider {
  readonly name: "google";
  search(
    query: string,
    page: number,
  ): Promise<Pick<WebSearchResponseData, "results">>;
}

interface SerpApiResponse {
  organic_results?: unknown;
  error?: unknown;
  search_metadata?: unknown;
}

const serpApiEndpoint = "https://serpapi.com/search";
const requestTimeoutMs = 15_000;
const resultsPerPage = 10;

export class SerpApiGoogleSearchProvider implements WebSearchProvider {
  public readonly name = "google" as const;

  public constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly endpoint = serpApiEndpoint,
  ) {}

  public async search(
    query: string,
    page: number,
  ): Promise<Pick<WebSearchResponseData, "results">> {
    const startedAt = Date.now();
    const params = new URLSearchParams({
      engine: "google",
      q: query,
      api_key: this.apiKey,
      output: "json",
      google_domain: "google.com",
      hl: "en",
      gl: "pk",
      start: String((page - 1) * resultsPerPage),
    });

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.endpoint}?${params.toString()}`, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch {
      this.logFailure("request", undefined, startedAt);
      throw searchProviderError();
    }

    let body: SerpApiResponse;
    try {
      const value: unknown = await response.json();
      if (!isRecord(value)) {
        throw new Error("SerpApi response was not an object.");
      }
      body = value;
    } catch {
      this.logFailure("invalid_json", response.status, startedAt);
      throw searchProviderError();
    }

    if (!response.ok) {
      this.logFailure(
        categoryForStatus(response.status),
        response.status,
        startedAt,
      );
      throw searchProviderError();
    }
    if (body.error !== undefined || searchStatus(body) === "error") {
      this.logFailure("upstream_error", response.status, startedAt);
      throw searchProviderError();
    }

    return {
      results: normalizeOrganicResults(body.organic_results),
    };
  }

  private logFailure(
    errorCategory: string,
    upstreamStatus: number | undefined,
    startedAt: number,
  ): void {
    logger.warn(
      {
        provider: "serpapi",
        upstreamStatus,
        errorCategory,
        elapsedMs: Math.max(0, Date.now() - startedAt),
      },
      "SerpApi web search failed",
    );
  }
}

class UnconfiguredSerpApiProvider implements WebSearchProvider {
  public readonly name = "google" as const;

  public search(): Promise<Pick<WebSearchResponseData, "results">> {
    logger.warn(
      {
        provider: "serpapi",
        errorCategory: "not_configured",
        elapsedMs: 0,
      },
      "SerpApi web search is not configured",
    );
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
  apiKey: string | undefined = env.SERPAPI_API_KEY,
): WebSearchProvider {
  return apiKey === undefined
    ? new UnconfiguredSerpApiProvider()
    : new SerpApiGoogleSearchProvider(apiKey);
}

export function normalizeOrganicResults(value: unknown): WebSearchResultDto[] {
  if (!Array.isArray(value)) return [];

  const normalized = new Map<string, WebSearchResultDto>();
  for (const item of value) {
    if (!isRecord(item)) continue;
    const title = stringValue(item.title);
    const url = safeHttpUrl(item.link);
    if (url === null || normalized.has(url)) continue;

    const result: WebSearchResultDto = { url };
    if (title !== null) result.title = title;
    const position = positiveInteger(item.position);
    if (position !== null) result.position = position;
    setOptionalString(result, "displayUrl", item.displayed_link);
    setOptionalString(result, "snippet", item.snippet);
    setOptionalString(result, "source", item.source);
    setOptionalHttpUrl(result, "favicon", item.favicon);
    setOptionalHttpUrl(result, "thumbnail", item.thumbnail);
    normalized.set(url, result);
  }
  return [...normalized.values()];
}

function setOptionalString(
  result: WebSearchResultDto,
  key: "displayUrl" | "snippet" | "source",
  value: unknown,
): void {
  const normalized = stringValue(value);
  if (normalized !== null) result[key] = normalized;
}

function setOptionalHttpUrl(
  result: WebSearchResultDto,
  key: "favicon" | "thumbnail",
  value: unknown,
): void {
  const normalized = safeHttpUrl(value);
  if (normalized !== null) result[key] = normalized;
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function searchStatus(value: SerpApiResponse): string | null {
  if (!isRecord(value.search_metadata)) return null;
  const status = value.search_metadata.status;
  return typeof status === "string" ? status.toLowerCase() : null;
}

function categoryForStatus(status: number): string {
  if (status === 401 || status === 403) return "credentials";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream_5xx";
  return "upstream_http_error";
}

function searchProviderError(): AppError {
  return new AppError({
    code: "WEB_SEARCH_PROVIDER_ERROR",
    message: "The web search provider is temporarily unavailable.",
    statusCode: 502,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
