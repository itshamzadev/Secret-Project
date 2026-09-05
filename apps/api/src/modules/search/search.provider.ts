import type {
  WebSearchResponseData,
  WebSearchResultDto,
} from "@terqivo/contracts";

import { AppError } from "../../core/errors.js";
import { logger } from "../../lib/logger.js";
import {
  buildSearchVariants,
  normalizeKnowledgeQuery,
} from "./search.query.js";
import {
  filterKnowledgeCandidates,
  rankKnowledgeCandidates,
  type KnowledgeCandidate,
} from "./search.rank.js";
import { searchRules } from "./search.rules.js";

export interface WebSearchProvider {
  readonly name: "terqivo";
  search(
    query: string,
    page: number,
  ): Promise<Pick<WebSearchResponseData, "results">>;
}

interface WikimediaSearchResponse {
  query?: {
    search?: unknown;
  };
  error?: unknown;
}

interface WikimediaEnrichmentResponse {
  query?: {
    pages?: unknown;
  };
  error?: unknown;
}

interface EnrichedPage {
  pageId: number;
  title: string;
  url: string;
  extract?: string;
  description?: string;
  thumbnail?: string;
}

const wikimediaEndpoint = "https://en.wikipedia.org/w/api.php";
const wikimediaUserAgent = "TerqivoConnect/0.1 (https://terqivo.com)";
const requestTimeoutMs = 15_000;

/**
 * Normal search is intentionally a free Wikimedia-backed knowledge lookup.
 * AI/Gemini routing lives in the separate AI module and is not used here.
 */
export class WikipediaKnowledgeSearchProvider implements WebSearchProvider {
  public readonly name = "terqivo" as const;

  public constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly endpoint = wikimediaEndpoint,
  ) {}

  public async search(
    query: string,
    page: number,
  ): Promise<Pick<WebSearchResponseData, "results">> {
    const normalizedQuery = normalizeKnowledgeQuery(query);
    const variants = buildSearchVariants(normalizedQuery);
    const startedAt = Date.now();

    let searchResponses: WikimediaSearchResponse[];
    try {
      searchResponses = await Promise.all(
        variants.map((variant) => this.searchVariant(variant, page)),
      );
    } catch (error: unknown) {
      this.logFailure("search_request", startedAt, providerErrorStatus(error));
      throw searchProviderError();
    }

    const candidates = searchResponses.flatMap((response) =>
      parseSearchCandidates(response),
    );
    const filteredCandidates = filterKnowledgeCandidates(
      candidates,
      normalizedQuery,
    );
    if (filteredCandidates.length === 0) {
      this.logSuccess(startedAt, 0);
      return { results: [] };
    }

    const rankedCandidates = rankKnowledgeCandidates(
      filteredCandidates,
      normalizedQuery,
    ).slice(0, searchRules.resultsPerPage);

    let enrichedPages: Map<number, EnrichedPage>;
    try {
      enrichedPages = await this.enrichPages(rankedCandidates);
    } catch (error: unknown) {
      this.logFailure(
        "enrichment_request",
        startedAt,
        providerErrorStatus(error),
      );
      throw searchProviderError();
    }

    const results = rankedCandidates.flatMap((candidate, index) => {
      const pageInfo = enrichedPages.get(candidate.pageId);
      if (pageInfo === undefined) return [];
      const result = toSearchResult(pageInfo, candidate, index + 1);
      return result === null ? [] : [result];
    });

    this.logSuccess(startedAt, results.length);
    return { results };
  }

  private async searchVariant(
    query: string,
    page: number,
  ): Promise<WikimediaSearchResponse> {
    const params = new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: query,
      srnamespace: "0",
      srlimit: String(searchRules.resultsPerPage),
      sroffset: String((page - 1) * searchRules.resultsPerPage),
      format: "json",
      formatversion: "2",
      origin: "*",
    });
    return this.fetchJson(`${this.endpoint}?${params.toString()}`);
  }

  private async enrichPages(
    candidates: readonly KnowledgeCandidate[],
  ): Promise<Map<number, EnrichedPage>> {
    const pageIds = [
      ...new Set(candidates.map((candidate) => candidate.pageId)),
    ];
    if (pageIds.length === 0) return new Map();

    const params = new URLSearchParams({
      action: "query",
      pageids: pageIds.join("|"),
      prop: "extracts|pageimages|description|info",
      exintro: "1",
      explaintext: "1",
      exchars: String(searchRules.maxSnippetLength),
      piprop: "thumbnail",
      pithumbsize: "320",
      inprop: "url",
      redirects: "1",
      format: "json",
      formatversion: "2",
      origin: "*",
    });
    const response = await this.fetchJson(
      `${this.endpoint}?${params.toString()}`,
    );
    return parseEnrichedPages(response);
  }

  private async fetchJson(
    url: string,
  ): Promise<WikimediaSearchResponse & WikimediaEnrichmentResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "user-agent": wikimediaUserAgent,
        },
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch (error: unknown) {
      throw new ProviderRequestError(error);
    }

    let value: unknown;
    try {
      value = await response.json();
    } catch (error: unknown) {
      throw new ProviderRequestError(error, response.status);
    }

    if (!response.ok || !isRecord(value) || value.error !== undefined) {
      throw new ProviderRequestError(undefined, response.status);
    }
    return value as WikimediaSearchResponse & WikimediaEnrichmentResponse;
  }

  private logFailure(
    errorCategory: string,
    startedAt: number,
    upstreamStatus?: number,
  ): void {
    logger.warn(
      {
        provider: "wikipedia",
        errorCategory,
        upstreamStatus,
        elapsedMs: Math.max(0, Date.now() - startedAt),
      },
      "Terqivo Knowledge Search failed",
    );
  }

  private logSuccess(startedAt: number, resultCount: number): void {
    logger.info(
      {
        provider: "wikipedia",
        resultCount,
        elapsedMs: Math.max(0, Date.now() - startedAt),
      },
      "Terqivo Knowledge Search provider completed",
    );
  }
}

export function createWebSearchProvider(): WebSearchProvider {
  return new WikipediaKnowledgeSearchProvider();
}

export function parseSearchCandidates(value: unknown): KnowledgeCandidate[] {
  if (!isRecord(value) || !isRecord(value.query)) return [];
  const searchItems = value.query.search;
  if (!Array.isArray(searchItems)) return [];

  return searchItems.flatMap((item) => {
    if (!isRecord(item)) return [];
    const pageId = positiveInteger(item.pageid);
    const title = stringValue(item.title);
    if (pageId === null || title === null) return [];
    const snippet = cleanSearchText(item.snippet);
    const candidate: KnowledgeCandidate = {
      pageId,
      title,
      position:
        positiveInteger(item.index) ?? positiveInteger(item.position) ?? 1,
      namespace: positiveInteger(item.ns) ?? 0,
    };
    if (snippet !== undefined) candidate.snippet = snippet;
    return [candidate];
  });
}

export function parseEnrichedPages(value: unknown): Map<number, EnrichedPage> {
  const pages =
    isRecord(value) && isRecord(value.query) ? value.query.pages : undefined;
  const pageItems = Array.isArray(pages)
    ? pages
    : isRecord(pages)
      ? Object.values(pages)
      : [];
  const enriched = new Map<number, EnrichedPage>();

  for (const item of pageItems) {
    if (!isRecord(item)) continue;
    const pageId = positiveInteger(item.pageid);
    const title = stringValue(item.title);
    const url = safeHttpUrl(item.fullurl) ?? safeHttpUrl(item.canonicalurl);
    if (pageId === null || title === null || url === null) continue;

    const thumbnail = isRecord(item.thumbnail)
      ? safeHttpUrl(item.thumbnail.source)
      : null;
    const page: EnrichedPage = { pageId, title, url };
    setOptionalString(page, "extract", item.extract);
    setOptionalString(page, "description", item.description);
    if (thumbnail !== null) page.thumbnail = thumbnail;
    enriched.set(pageId, page);
  }
  return enriched;
}

export function cleanSearchText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const withoutTags = value.replace(/<[^>]*>/gu, " ");
  const decoded = withoutTags
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&#x([\da-f]+);/giu, (_, hex: string) => decodeCodePoint(hex, 16))
    .replace(/&#(\d+);/gu, (_, decimal: string) => decodeCodePoint(decimal, 10))
    .replace(/\s+/gu, " ")
    .trim();
  return decoded.length > 0
    ? trimToWords(decoded, searchRules.maxSnippetLength)
    : undefined;
}

function toSearchResult(
  page: EnrichedPage,
  candidate: KnowledgeCandidate,
  position: number,
): WebSearchResultDto | null {
  const snippet = cleanSearchText(
    page.extract ?? page.description ?? candidate.snippet,
  );
  const result: WebSearchResultDto = {
    position,
    title: page.title,
    url: page.url,
    displayUrl: new URL(page.url).hostname,
    source: "Wikipedia",
  };
  if (snippet !== undefined) result.snippet = snippet;
  if (page.thumbnail !== undefined) result.thumbnail = page.thumbnail;
  return result;
}

function trimToWords(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const clipped = value
    .slice(0, maxLength)
    .replace(/\s+\S*$/u, "")
    .trim();
  return `${clipped || value.slice(0, maxLength).trim()}…`;
}

function searchProviderError(): AppError {
  return new AppError({
    code: "WEB_SEARCH_PROVIDER_ERROR",
    message: "The knowledge search provider is temporarily unavailable.",
    statusCode: 502,
  });
}

class ProviderRequestError extends Error {
  public constructor(
    cause: unknown,
    public readonly status?: number,
  ) {
    super(cause instanceof Error ? cause.message : "Wikimedia request failed");
    this.name = "ProviderRequestError";
  }
}

function providerErrorStatus(error: unknown): number | undefined {
  return error instanceof ProviderRequestError ? error.status : undefined;
}

function decodeCodePoint(value: string, radix: number): string {
  const codePoint = Number.parseInt(value, radix);
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : "";
}

function setOptionalString(
  target: EnrichedPage,
  key: "extract" | "description",
  value: unknown,
): void {
  const normalized = cleanSearchText(value);
  if (normalized !== undefined) target[key] = normalized;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
