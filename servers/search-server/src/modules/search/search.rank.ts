import { buildSearchVariants, comparableText, importantQueryTokens } from "./search.query.js";
import { isBlockedKnowledgeTitle, isDisambiguationTitle, isListLikeTitle } from "./search.rules.js";

export interface KnowledgeCandidate { pageId: number; title: string; snippet?: string; position: number; namespace: number; }
export interface RankedKnowledgeCandidate extends KnowledgeCandidate { score: number; }

export function filterKnowledgeCandidates(candidates: readonly KnowledgeCandidate[], query: string): KnowledgeCandidate[] {
  const unique = new Map<number, KnowledgeCandidate>();
  for (const candidate of candidates) {
    if (isBlockedKnowledgeTitle(candidate.title, candidate.namespace)) continue;
    const existing = unique.get(candidate.pageId);
    if (existing === undefined || candidate.position < existing.position) unique.set(candidate.pageId, candidate);
  }
  const eligible = [...unique.values()];
  const asksForList = /\blist\b|\bindex\b/iu.test(query);
  const useful = eligible.filter((candidate) => !isDisambiguationTitle(candidate.title, candidate.snippet) && (asksForList || !isListLikeTitle(candidate.title)));
  return useful.length > 0 ? useful : eligible;
}

export function rankKnowledgeCandidates(candidates: readonly KnowledgeCandidate[], query: string): RankedKnowledgeCandidate[] {
  const normalized = comparableText(query);
  const entity = comparableText(buildSearchVariants(query)[0] ?? query);
  const tokens = importantQueryTokens(query);
  return candidates.map((candidate) => ({ ...candidate, score: score(candidate, normalized, entity, tokens) })).sort((a, b) => b.score - a.score || a.position - b.position || a.title.localeCompare(b.title));
}

export function scoreKnowledgeCandidate(candidate: KnowledgeCandidate, query: string): number {
  return score(candidate, comparableText(query), comparableText(buildSearchVariants(query)[0] ?? query), importantQueryTokens(query));
}

function score(candidate: KnowledgeCandidate, normalized: string, entity: string, tokens: readonly string[]): number {
  const title = comparableText(candidate.title);
  const snippet = comparableText(candidate.snippet ?? "");
  const titleTokens = new Set(title.split(" ").filter(Boolean));
  const snippetTokens = new Set(snippet.split(" ").filter(Boolean));
  let value = Math.max(0, 10 - candidate.position);
  if (title === normalized || title === entity) value += 100;
  if (title.startsWith(normalized) || (entity.length > 0 && title.startsWith(entity))) value += 60;
  if (tokens.length > 0 && tokens.every((token) => titleTokens.has(token))) value += 40;
  if (normalized.length > 0 && snippet.includes(normalized)) value += 25;
  if (tokens.length > 0 && tokens.every((token) => snippetTokens.has(token))) value += 15;
  if (!tokens.some((token) => titleTokens.has(token))) value -= 20;
  if (isDisambiguationTitle(candidate.title, candidate.snippet)) value -= 50;
  if (isListLikeTitle(candidate.title)) value -= 40;
  if (/^(?:index of|category:)/iu.test(candidate.title)) value -= 30;
  return value;
}
