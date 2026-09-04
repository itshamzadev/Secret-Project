import type { WebSearchResultDto } from "@terqivo/contracts";

import { env } from "../../config/env.js";
import { AppError } from "../../core/errors.js";

export interface WebSearchProvider {
  readonly name: "google" | "wikipedia";
  search(query: string): Promise<WebSearchResultDto[]>;
}

const requestTimeoutMs = 10_000;

export function createWebSearchProvider(): WebSearchProvider {
  if (
    env.GOOGLE_SEARCH_API_KEY !== undefined &&
    env.GOOGLE_SEARCH_ENGINE_ID !== undefined
  ) {
    return new GoogleSearchProvider(
      env.GOOGLE_SEARCH_API_KEY,
      env.GOOGLE_SEARCH_ENGINE_ID,
    );
  }
  return new WikipediaSearchProvider();
}

class GoogleSearchProvider implements WebSearchProvider {
  public readonly name = "google" as const;

  public constructor(
    private readonly apiKey: string,
    private readonly engineId: string,
  ) {}

  public async search(query: string): Promise<WebSearchResultDto[]> {
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("cx", this.engineId);
    url.searchParams.set("q", query);
    url.searchParams.set("num", "10");
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      throw new AppError({
        code: "WEB_SEARCH_PROVIDER_ERROR",
        message: "The web search provider is temporarily unavailable.",
        statusCode: 502,
      });
    }
    const body: unknown = await response.json();
    return parseGoogleResults(body);
  }
}

class WikipediaSearchProvider implements WebSearchProvider {
  public readonly name = "wikipedia" as const;

  public async search(query: string): Promise<WebSearchResultDto[]> {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "search");
    url.searchParams.set("srsearch", query);
    url.searchParams.set("srlimit", "10");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      throw new AppError({
        code: "WEB_SEARCH_PROVIDER_ERROR",
        message: "The web search provider is temporarily unavailable.",
        statusCode: 502,
      });
    }
    const body: unknown = await response.json();
    return parseWikipediaResults(body);
  }
}

async function fetchWithTimeout(url: URL): Promise<Response> {
  const signal = AbortSignal.timeout(requestTimeoutMs);
  try {
    return await fetch(url, {
      signal,
      headers: { accept: "application/json" },
    });
  } catch {
    throw new AppError({
      code: "WEB_SEARCH_PROVIDER_ERROR",
      message: "The web search provider is temporarily unavailable.",
      statusCode: 502,
    });
  }
}

function parseGoogleResults(value: unknown): WebSearchResultDto[] {
  if (!isRecord(value) || !Array.isArray(value.items)) return [];
  return value.items.flatMap((item: unknown) => {
    if (!isRecord(item)) return [];
    const title = stringValue(item.title);
    const snippet = stringValue(item.snippet);
    const url = safeHttpUrl(stringValue(item.link));
    if (title === null || snippet === null || url === null) return [];
    return [{ title, snippet, url, source: new URL(url).hostname }];
  });
}

function parseWikipediaResults(value: unknown): WebSearchResultDto[] {
  if (
    !isRecord(value) ||
    !isRecord(value.query) ||
    !Array.isArray(value.query.search)
  ) {
    return [];
  }
  return value.query.search.flatMap((item: unknown) => {
    if (!isRecord(item)) return [];
    const title = stringValue(item.title);
    const snippet = stripHtml(stringValue(item.snippet) ?? "");
    const pageId = typeof item.pageid === "number" ? item.pageid : null;
    if (title === null || pageId === null) return [];
    const url = `https://en.wikipedia.org/?curid=${pageId}`;
    return [{ title, snippet, url, source: "wikipedia.org" }];
  });
}

function safeHttpUrl(value: string | null): string | null {
  if (value === null) return null;
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

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
