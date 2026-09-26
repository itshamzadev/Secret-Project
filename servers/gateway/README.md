# `@terqivo/gateway`

The production Main Hub is an explicit streaming reverse proxy. It contains no
business logic, database access, E2EFE handling, or call/media processing. It
has no legacy monolith fallback.

## Local configuration

```powershell
$env:NODE_ENV = "development"
$env:PORT = "5000"
$env:AUTH_SERVICE_URL = "http://127.0.0.1:5101"
$env:MESSAGE_SERVICE_URL = "http://127.0.0.1:5102"
$env:CALL_SERVICE_URL = "http://127.0.0.1:5103"
$env:MEDIA_SERVICE_URL = "http://127.0.0.1:5104"
$env:NOTIFICATION_SERVICE_URL = "http://127.0.0.1:5105"
$env:SEARCH_SERVICE_URL = "http://127.0.0.1:5106"
$env:ADMIN_SERVICE_URL = "http://127.0.0.1:5107"
$env:REALTIME_HUB_URL = "http://127.0.0.1:5108"
$env:RELATIONSHIP_SERVICE_URL = "http://127.0.0.1:5109"
$env:STATUS_SERVICE_URL = "http://127.0.0.1:5110"
pnpm dev
```

Clients use only `http://127.0.0.1:5000` locally and one public HTTPS Gateway
URL in production.

## Route ownership

Auth/users -> `AUTH_SERVICE_URL`; contacts/block -> `RELATIONSHIP_SERVICE_URL`;
conversation/message/group/channel/E2EFE -> `MESSAGE_SERVICE_URL`; calls ->
`CALL_SERVICE_URL`; media -> `MEDIA_SERVICE_URL`; notifications ->
`NOTIFICATION_SERVICE_URL`; search/AI -> `SEARCH_SERVICE_URL`; admin/reports ->
`ADMIN_SERVICE_URL`; status -> `STATUS_SERVICE_URL`; `/socket.io` ->
`REALTIME_HUB_URL`. Gateway owns `/health`, `/ready`, and `/api/v1/health*`.
Unmapped paths return 404 and cannot select an upstream.

HTTP requests are streamed with `http-proxy`; methods, paths, queries, headers,
cookies, status, content type, binary/multipart bodies, and response streams
are preserved. Socket.IO polling and WebSocket upgrades retain `/socket.io`,
event names, namespaces, and payloads. Request/correlation IDs are generated
or accepted safely, returned to clients, forwarded internally, and logged
without authorization, cookies, message content, ciphertext, or file bodies.

## Standalone deployment

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
docker build -t terqivo-gateway .
```

Only Gateway is publicly exposed. The edge/load balancer must preserve
WebSocket upgrades and forwarded headers; all service URLs remain private.
