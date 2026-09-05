# Search

Authenticated web search is exposed through the `/api/v1/search/web` endpoint.
The endpoint uses SerpApi's server-side Google Search API and returns normalized
organic results only. Provider failures are reported as retryable errors. The
SerpApi key never leaves the API process.
