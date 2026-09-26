# `@terqivo/status-server`

Phase 13 Status / Stories service. It is the distributed owner of the existing
`statuses` MongoDB collection and preserves the public `/api/v1/status/*`
contract used by the client.

## Responsibilities

- create and delete text/image/video/audio statuses;
- return the contact-visible feed in the existing newest-first order;
- preserve 24-hour expiry, embedded `viewedBy`, viewer counts, and owner-only
  viewer details;
- query Auth Server for access-token validation and safe public user data;
- query Relationship Server for contact and block facts, failing closed when
  relationship policy is unavailable;
- delegate all media bytes to Media Server through its authenticated internal
  file API. This service stores only the existing media metadata/reference.

There is currently no status push notification, status Socket.IO event, Redis
status state, or status reply flow in the existing implementation, so Phase 13
does not invent one.

## Public-compatible routes

```text
GET    /api/v1/status/
POST   /api/v1/status/
POST   /api/v1/status/media
GET    /api/v1/status/:statusId/media
POST   /api/v1/status/:statusId/view
DELETE /api/v1/status/:statusId
```

The Gateway maps `/api/v1/status/*` to `STATUS_SERVICE_URL`; clients keep one
base URL. The former monolith route is retained only in retired source for
direct compatibility tests and is not a distributed runtime dependency.

## Local development

```powershell
$env:NODE_ENV = "development"
$env:PORT = "5110"
$env:MONGODB_URI = "mongodb://127.0.0.1:27017/terqivo"
$env:AUTH_SERVICE_URL = "http://127.0.0.1:5101"
$env:RELATIONSHIP_SERVICE_URL = "http://127.0.0.1:5109"
$env:MEDIA_SERVICE_URL = "http://127.0.0.1:5104"
$env:INTERNAL_SERVICE_SECRET = "use-the-shared-development-secret"
pnpm dev
```

Production requires `INTERNAL_SERVICE_SECRET`. MongoDB indexes are initialized
by the Status Server at startup. Expired records are cleaned by the Status
Server request path, matching the existing behavior; no second worker is active
in the distributed Gateway topology.

## Standalone deployment

This directory contains its own package manifest, lockfile, TypeScript
configuration, pnpm build policy, Dockerfile, source, and tests. It has no
runtime or build-time imports from `apps/api`, root packages, or sibling
services. Services communicate only through HTTP and shared infrastructure.

```powershell
cd servers/status-server
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
docker build -t terqivo-status .
```
