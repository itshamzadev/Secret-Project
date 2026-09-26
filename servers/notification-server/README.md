# `@terqivo/notification-server`

Phase 9 Notification / Push Delivery service. It is the single active owner of
push-device registration, notification intent persistence, Expo Push Service
dispatch, ticket/receipt processing, invalid-token disabling, retry/backoff,
and notification idempotency.

## Public compatibility routes

The Gateway keeps the client base URL and routes these unchanged paths here:

```text
/api/v1/notifications/devices                 POST/DELETE
/api/v1/notifications/diagnostics/test-push  POST
```

The response shape and Expo notification data keys remain compatible with the
Android client. Device DTOs never return the push token.

## Internal delivery API

Message Server and Call Server use:

```text
POST /internal/notifications
X-Internal-Service-Token: <short-lived HS256 service JWT>
```

Only `message-server`, `call-server`, and `admin-server` service identities are
accepted by the internal API. Requests contain safe notification intents and
stable deduplication keys; they do not contain ciphertext or user access tokens.

## Persistence and delivery

The service uses the existing `push_devices` collection without creating a
second device collection. Notification intents are durable records in the new
`notifications` collection. MongoDB is the recovery source of truth: workers
claim pending/retry records atomically, apply bounded exponential backoff, and
recover after a process restart. Redis remains a required private dependency
for readiness and shared infrastructure, but is not the durable notification
source of truth.

Expo ticket responses are summarized without logging tokens. `DeviceNotRegistered`
tokens are disabled. Receipt results are processed when requested by the
diagnostic flow; normal delivery remains asynchronous and retryable.

Encrypted message notifications use the same generic `New encrypted message`
preview as before. This service never decrypts, parses, logs, or stores Signal
ciphertext.

## Standalone operation

This directory is an independent build context and has no runtime dependency on
`apps/api`, another service, or a root `workspace:*` package:

```powershell
cd servers/notification-server
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
docker build -t terqivo-notification .
```

Configure `MONGODB_URI`, `REDIS_URL`, the existing JWT verification settings,
the shared internal-service secret, and Expo provider settings through the
environment. MongoDB and Redis must remain private; only the Gateway is public.
