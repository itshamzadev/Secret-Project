# Search

Authenticated web search is exposed through the `/api/v1/search/web` endpoint.
The endpoint is Terqivo Knowledge Search: a deterministic, server-side Wikimedia
search and ranking layer. It normalizes queries, filters low-value namespaces,
enriches selected pages in one batched request, and returns truthful Wikipedia
source attribution. It has no paid provider or API key requirement. Provider
failures are reported as retryable errors.
