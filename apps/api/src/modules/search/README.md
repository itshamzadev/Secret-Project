# Search

Authenticated web search is exposed through the `/api/v1/search/web` endpoint.
The provider abstraction uses Google Programmable Search when both server-side
Google credentials are configured and otherwise uses the explicitly labelled
Wikipedia fallback. Provider keys never leave the API process.
