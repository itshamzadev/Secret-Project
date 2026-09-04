import type { WebSearchResponseData } from "@terqivo/contracts";

import { createWebSearchProvider } from "./search.provider.js";
import type { WebSearchQuery } from "./search.validation.js";

export async function searchWeb(
  query: WebSearchQuery,
): Promise<WebSearchResponseData> {
  const provider = createWebSearchProvider();
  return {
    query: query.q,
    provider: provider.name,
    results: await provider.search(query.q),
  };
}
