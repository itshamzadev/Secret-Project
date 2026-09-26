# Search / AI Server

This is the Phase 11 Search Server. It is independently deployable on port
5106 and owns the audited public search and AI routes:

- `GET /api/v1/search/web?q=...&page=...`
- `GET /api/v1/ai/models`
- `POST /api/v1/ai/query`
- `POST /api/v1/ai/query/stream` (SSE)

It validates the end-user bearer token through Auth Server's internal
`/internal/auth/validate` endpoint, preserves the existing contracts and rate
limits, and never reads message history or encrypted payloads. Wikimedia is
the web-search provider; Gemini is optional and only receives the current AI
prompt plus the fixed product system instruction. Redis is an optional cache,
not a source of truth.

## Local run

From this directory, copy `.env.example` to `.env`, set the internal secret
used by Auth Server, then run `pnpm install`, `pnpm run build`, and
`pnpm start`. The service can be copied and built without the repository root,
`apps/api`, `packages`, or another `servers` directory.
