import { searchRules } from "./search.rules.js";

const intentPattern = /^(?:who\s+is|what\s+is|tell\s+me\s+about)\s+(.+)$/iu;

export function normalizeKnowledgeQuery(query: string): string {
  return query
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[?!؟。]+$/gu, "")
    .trim();
}

export function buildSearchVariants(query: string): string[] {
  const normalized = normalizeKnowledgeQuery(query);
  const variants = [normalized];
  const intentMatch = normalized.match(intentPattern);
  const entity =
    intentMatch?.[1] === undefined
      ? undefined
      : normalizeKnowledgeQuery(intentMatch[1]);
  if (entity !== undefined && entity.length > 0) variants.unshift(entity);
  return [...new Set(variants)].slice(0, searchRules.maxVariants);
}

export function importantQueryTokens(query: string): string[] {
  return normalizeKnowledgeQuery(query)
    .toLocaleLowerCase("en-US")
    .replace(/["'“”‘’.,:;!?()[\]{}]/gu, " ")
    .split(/\s+/u)
    .filter((token) => token.length > 1 && !searchRules.stopWords.has(token));
}

export function comparableText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
