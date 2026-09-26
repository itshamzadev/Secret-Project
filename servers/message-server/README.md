# Terqivo Message Server

This is the Phase 5 self-contained Message/Conversation/Community service. It
owns the HTTP routes for conversations, messages, groups, channels, and the
existing E2EFE device/envelope workflow. It is behind the Gateway and is not a
publicly exposed service.

## Local topology

```text
Gateway :5000
  |-- auth/user -> Auth Server :5101
  |-- messages/conversations/groups/channels/e2efe -> Message Server :5102
  `-- calls/media/notifications/search/admin/contacts -> their owning services
      socket.io -> Realtime Hub :5108
```

The client still uses one Gateway URL. The Message Server may use the same
MongoDB and Redis deployment as the other services, but it does not create
duplicate users, conversations, messages, or E2EFE collections.

## Run

From this directory, copy `.env.example` to a private `.env`, configure the
existing MongoDB/Redis/JWT values, and run:

```powershell
pnpm install
pnpm build
pnpm start
```

Default port: `5102`. `/health` is liveness, `/ready` checks MongoDB and Redis.

## Internal realtime bridge

The public Socket.IO endpoint belongs to Realtime Hub. Message Server
mutations publish sanitized event envelopes on `terqivo:message-events:v1`
for the Hub to emit using the existing public event names. No Signal
ciphertext is logged, parsed, or changed by the bridge.

The internal `/internal/*` endpoints are not client routes. They require a
short-lived JWT service token with an explicit caller allowlist and a normal
user Bearer token where user context is required.

## Extraction boundary

This service must remain independently deployable. Its package has no
`workspace:*` or `file:../../...` runtime dependency and its Dockerfile uses
this directory as the complete build context. It communicates with other
services only through HTTP/Redis and reads the existing shared collections
transitionally.
