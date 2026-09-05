import {
  buildSearchVariants,
  comparableText,
  importantQueryTokens,
} from "./search.query.js";
import {
  isBlockedKnowledgeTitle,
  isDisambiguationTitle,
  isListLikeTitle,
} from "./search.rules.js";

export interface KnowledgeCandidate {
  pageId: number;
  title: string;
  snippet?: string;
  position: number;
  namespace: number;
}

export interface RankedKnowledgeCandidate extends KnowledgeCandidate {
  score: number;
}

export function filterKnowledgeCandidates(
  candidates: readonly KnowledgeCandidate[],
  query: string,
): KnowledgeCandidate[] {
  const uniqueCandidates = new Map<number, KnowledgeCandidate>();
  for (const candidate of candidates) {
    if (isBlockedKnowledgeTitle(candidate.title, candidate.namespace)) continue;
    const existing = uniqueCandidates.get(candidate.pageId);
    if (existing === undefined || candidate.position < existing.position) {
      uniqueCandidates.set(candidate.pageId, candidate);
    }
  }
  const eligible = [...uniqueCandidates.values()];
  const asksForList = /\blist\b|\bindex\b/iu.test(query);
  const useful = eligible.filter(
    (candidate) =>
      !isDisambiguationTitle(candidate.title, candidate.snippet) &&
      (asksForList || !isListLikeTitle(candidate.title)),
  );
  return useful.length > 0 ? useful : eligible;
}

export function rankKnowledgeCandidates(
  candidates: readonly KnowledgeCandidate[],
  query: string,
): RankedKnowledgeCandidate[] {
  const normalizedQuery = comparableText(query);
  const entityQuery = comparableText(buildSearchVariants(query)[0] ?? query);
  const queryTokens = importantQueryTokens(query);

  return candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreKnowledgeCandidateWithTokens(
        candidate,
        normalizedQuery,
        entityQuery,
        queryTokens,
      ),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.position - right.position ||
        left.title.localeCompare(right.title),
    );
}

export function scoreKnowledgeCandidate(
  candidate: KnowledgeCandidate,
  query: string,
): number {
  const normalizedQuery = comparableText(query);
  const entityQuery = comparableText(buildSearchVariants(query)[0] ?? query);
  return scoreKnowledgeCandidateWithTokens(
    candidate,
    normalizedQuery,
    entityQuery,
    importantQueryTokens(query),
  );
}

function scoreKnowledgeCandidateWithTokens(
  candidate: KnowledgeCandidate,
  normalizedQuery: string,
  entityQuery: string,
  queryTokens: readonly string[],
): number {
  const title = comparableText(candidate.title);
  const snippet = comparableText(candidate.snippet ?? "");
  const titleTokens = new Set(title.split(" ").filter(Boolean));
  const snippetTokens = new Set(snippet.split(" ").filter(Boolean));
  let score = Math.max(0, 10 - candidate.position);

  if (title === normalizedQuery || title === entityQuery) score += 100;
  if (
    title.startsWith(normalizedQuery) ||
    (entityQuery.length > 0 && title.startsWith(entityQuery))
  ) {
    score += 60;
  }
  if (
    queryTokens.length > 0 &&
    queryTokens.every((token) => titleTokens.has(token))
  ) {
    score += 40;
  }
  if (normalizedQuery.length > 0 && snippet.includes(normalizedQuery))
    score += 25;
  if (
    queryTokens.length > 0 &&
    queryTokens.every((token) => snippetTokens.has(token))
  ) {
    score += 15;
  }

  const hasImportantOverlap = queryTokens.some((token) =>
    titleTokens.has(token),
  );
  if (!hasImportantOverlap) score -= 20;
  if (isDisambiguationTitle(candidate.title, candidate.snippet)) score -= 50;
  if (isListLikeTitle(candidate.title)) score -= 40;
  if (/^(?:index of|category:)/iu.test(candidate.title)) score -= 30;
  return score;
}
