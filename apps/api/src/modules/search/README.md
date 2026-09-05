# Search

Authenticated web search is exposed through the `/api/v1/search/web` endpoint.
The endpoint uses Gemini's server-side Google Search grounding tool and returns
only URLs and citation fields supplied by Gemini. Provider failures are
reported as retryable errors. The Gemini key never leaves the API process.
