export const searchRules = {
  resultsPerPage: 10,
  maxSnippetLength: 240,
  cacheTtlSeconds: 15 * 60,
  maxVariants: 2,
  blockedNamespaces: new Set([
    "category",
    "template",
    "help",
    "portal",
    "talk",
    "user",
    "wikipedia",
    "file",
    "draft",
    "module",
    "mediawiki",
  ]),
  stopWords: new Set([
    "a",
    "about",
    "an",
    "and",
    "are",
    "for",
    "how",
    "is",
    "me",
    "of",
    "on",
    "or",
    "tell",
    "the",
    "to",
    "what",
    "who",
    "with",
  ]),
} as const;

export function isBlockedKnowledgeTitle(
  title: string,
  namespace: number,
): boolean {
  if (namespace !== 0) return true;
  const namespacePrefix = title.split(":", 1)[0]?.toLocaleLowerCase("en-US");
  return (
    namespacePrefix !== undefined &&
    searchRules.blockedNamespaces.has(namespacePrefix)
  );
}

export function isDisambiguationTitle(
  title: string,
  snippet?: string,
): boolean {
  return (
    /\(disambiguation\)$/iu.test(title) ||
    /\bdisambiguation\b|may refer to/iu.test(snippet ?? "")
  );
}

export function isListLikeTitle(title: string): boolean {
  return /^(?:list of|index of)\b/iu.test(title);
}
