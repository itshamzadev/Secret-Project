import { AppError } from "../../core/errors.js";
import { logger } from "../../logging/logger.js";
import type { WebSearchProvider, WebSearchResultDto } from "./types.js";
import { buildSearchVariants, normalizeKnowledgeQuery } from "./search.query.js";
import { filterKnowledgeCandidates, rankKnowledgeCandidates, type KnowledgeCandidate } from "./search.rank.js";
import { searchRules } from "./search.rules.js";

interface SearchResponse { query?: { search?: unknown }; error?: unknown; }
interface PageResponse { query?: { pages?: unknown }; error?: unknown; }
interface EnrichedPage { pageId: number; title: string; url: string; extract?: string; description?: string; thumbnail?: string; }
const endpoint = "https://en.wikipedia.org/w/api.php";
const userAgent = "TerqivoConnect/0.1 (https://terqivo.com)";

export class WikipediaKnowledgeSearchProvider implements WebSearchProvider {
  public readonly name = "terqivo" as const;
  public constructor(private readonly fetchImpl: typeof fetch = fetch, private readonly apiEndpoint = endpoint) {}
  public async search(query: string, page: number): Promise<{ results: WebSearchResultDto[] }> {
    const normalized = normalizeKnowledgeQuery(query);
    const started = Date.now();
    let responses: SearchResponse[];
    try { responses = await Promise.all(buildSearchVariants(normalized).map((variant) => this.searchVariant(variant, page))); }
    catch (error) { logger.warn({ err: error, provider: "wikipedia" }, "Knowledge search request failed"); throw providerError(); }
    const candidates = filterKnowledgeCandidates(responses.flatMap(parseSearchCandidates), normalized);
    if (candidates.length === 0) return { results: [] };
    const ranked = rankKnowledgeCandidates(candidates, normalized).slice(0, searchRules.resultsPerPage);
    let pages: Map<number, EnrichedPage>;
    try { pages = await this.enrichPages(ranked); }
    catch (error) { logger.warn({ err: error, provider: "wikipedia" }, "Knowledge search enrichment failed"); throw providerError(); }
    const results = ranked.flatMap((candidate, index) => {
      const pageInfo = pages.get(candidate.pageId);
      if (pageInfo === undefined) return [];
      const result = toSearchResult(pageInfo, candidate, index + 1);
      return result === null ? [] : [result];
    });
    logger.info({ provider: "wikipedia", resultCount: results.length, elapsedMs: Date.now() - started }, "Knowledge search completed");
    return { results };
  }
  private searchVariant(query: string, page: number): Promise<SearchResponse> {
    const params = new URLSearchParams({ action: "query", list: "search", srsearch: query, srnamespace: "0", srlimit: String(searchRules.resultsPerPage), sroffset: String((page - 1) * searchRules.resultsPerPage), format: "json", formatversion: "2", origin: "*" });
    return this.fetchJson(`${this.apiEndpoint}?${params.toString()}`) as Promise<SearchResponse>;
  }
  private async enrichPages(candidates: readonly KnowledgeCandidate[]): Promise<Map<number, EnrichedPage>> {
    const ids = [...new Set(candidates.map((candidate) => candidate.pageId))];
    if (ids.length === 0) return new Map();
    const params = new URLSearchParams({ action: "query", pageids: ids.join("|"), prop: "extracts|pageimages|description|info", exintro: "1", explaintext: "1", exchars: String(searchRules.maxSnippetLength), piprop: "thumbnail", pithumbsize: "320", inprop: "url", redirects: "1", format: "json", formatversion: "2", origin: "*" });
    return parseEnrichedPages(await this.fetchJson(`${this.apiEndpoint}?${params.toString()}`));
  }
  private async fetchJson(url: string): Promise<SearchResponse & PageResponse> {
    let response: Response;
    try { response = await this.fetchImpl(url, { method: "GET", headers: { accept: "application/json", "user-agent": userAgent }, signal: AbortSignal.timeout(15_000) }); }
    catch (error) { throw new ProviderRequestError(error); }
    let value: unknown;
    try { value = await response.json(); } catch (error) { throw new ProviderRequestError(error, response.status); }
    if (!response.ok || !isRecord(value) || value.error !== undefined) throw new ProviderRequestError(undefined, response.status);
    return value as SearchResponse & PageResponse;
  }
}

export function createWebSearchProvider(): WebSearchProvider { return new WikipediaKnowledgeSearchProvider(); }

export function parseSearchCandidates(value: unknown): KnowledgeCandidate[] {
  if (!isRecord(value) || !isRecord(value.query) || !Array.isArray(value.query.search)) return [];
  return value.query.search.flatMap((item) => {
    if (!isRecord(item)) return [];
    const pageId = positiveInteger(item.pageid); const title = stringValue(item.title);
    if (pageId === null || title === null) return [];
    const candidate: KnowledgeCandidate = { pageId, title, position: positiveInteger(item.index) ?? positiveInteger(item.position) ?? 1, namespace: positiveInteger(item.ns) ?? 0 };
    const snippet = cleanSearchText(item.snippet); if (snippet !== undefined) candidate.snippet = snippet;
    return [candidate];
  });
}

export function parseEnrichedPages(value: unknown): Map<number, EnrichedPage> {
  const pages = isRecord(value) && isRecord(value.query) ? value.query.pages : undefined;
  const items = Array.isArray(pages) ? pages : isRecord(pages) ? Object.values(pages) : [];
  const result = new Map<number, EnrichedPage>();
  for (const item of items) {
    if (!isRecord(item)) continue;
    const pageId = positiveInteger(item.pageid); const title = stringValue(item.title); const url = safeHttpUrl(item.fullurl) ?? safeHttpUrl(item.canonicalurl);
    if (pageId === null || title === null || url === null) continue;
    const page: EnrichedPage = { pageId, title, url };
    setOptional(page, "extract", item.extract); setOptional(page, "description", item.description);
    if (isRecord(item.thumbnail)) { const thumbnail = safeHttpUrl(item.thumbnail.source); if (thumbnail !== null) page.thumbnail = thumbnail; }
    result.set(pageId, page);
  }
  return result;
}

export function cleanSearchText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const decoded = value.replace(/<[^>]*>/gu, " ").replace(/&nbsp;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#39;|&apos;/giu, "'").replace(/&lt;/giu, "<").replace(/&gt;/giu, ">")
    .replace(/&#x([\da-f]+);/giu, (_, hex: string) => decodeCodePoint(hex, 16)).replace(/&#(\d+);/gu, (_, decimal: string) => decodeCodePoint(decimal, 10)).replace(/\s+/gu, " ").trim();
  if (decoded.length === 0) return undefined;
  if (decoded.length <= searchRules.maxSnippetLength) return decoded;
  return `${decoded.slice(0, searchRules.maxSnippetLength).replace(/\s+\S*$/u, "").trim() || decoded.slice(0, searchRules.maxSnippetLength).trim()}…`;
}

function toSearchResult(page: EnrichedPage, candidate: KnowledgeCandidate, position: number): WebSearchResultDto | null {
  const snippet = cleanSearchText(page.extract ?? page.description ?? candidate.snippet);
  const result: WebSearchResultDto = { position, title: page.title, url: page.url, displayUrl: new URL(page.url).hostname, source: "Wikipedia" };
  if (snippet !== undefined) result.snippet = snippet;
  if (page.thumbnail !== undefined) result.thumbnail = page.thumbnail;
  return result;
}
function providerError(): AppError { return new AppError({ code: "WEB_SEARCH_PROVIDER_ERROR", message: "The knowledge search provider is temporarily unavailable.", statusCode: 502 }); }
class ProviderRequestError extends Error { public constructor(cause: unknown, public readonly status?: number) { super(cause instanceof Error ? cause.message : "Wikimedia request failed"); } }
function decodeCodePoint(value: string, radix: number): string { const codePoint = Number.parseInt(value, radix); return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : ""; }
function setOptional(target: EnrichedPage, key: "extract" | "description", value: unknown): void { const normalized = cleanSearchText(value); if (normalized !== undefined) target[key] = normalized; }
function safeHttpUrl(value: unknown): string | null { if (typeof value !== "string" || value.trim() === "") return null; try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null; } catch { return null; } }
function stringValue(value: unknown): string | null { return typeof value === "string" && value.trim() !== "" ? value.trim() : null; }
function positiveInteger(value: unknown): number | null { return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
