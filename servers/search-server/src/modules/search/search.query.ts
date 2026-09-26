import { searchRules } from "./search.rules.js";

const intentPattern = /^(?:who\s+is|what\s+is|tell\s+me\s+about)\s+(.+)$/iu;

export function normalizeKnowledgeQuery(query: string): string {
  return query.normalize("NFKC").replace(/\s+/gu, " ").trim().replace(/[?!ØŸã€‚]+$/gu, "").trim();
}

export function buildSearchVariants(query: string): string[] {
  const normalized = normalizeKnowledgeQuery(query);
  const match = normalized.match(intentPattern);
  const entity = match?.[1] === undefined ? undefined : normalizeKnowledgeQuery(match[1]);
  const variants = [normalized];
  if (entity !== undefined && entity.length > 0) variants.unshift(entity);
  return [...new Set(variants)].slice(0, searchRules.maxVariants);
}

export function importantQueryTokens(query: string): string[] {
  return normalizeKnowledgeQuery(query).toLocaleLowerCase("en-US").replace(/["'â€œâ€â€˜â€™.,:;!?()[\]{}]/gu, " ").split(/\s+/u).filter((token) => token.length > 1 && !searchRules.stopWords.has(token));
}

export function comparableText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/gu, " ").trim();
}
