# Realtime Hub

The Realtime Hub is the Phase 7 public Socket.IO transport service. It is the
only service that owns the public `/socket.io` transport in the distributed
topology; the Gateway proxies that path without changing its path, namespaces,
events, payloads, or acknowledgements.

## Responsibilities

- Authenticate Socket.IO connections with the existing user JWT contract and
  confirm the account through Auth Server.
- Maintain user rooms, multi-device session connection accounting, presence,
  and typing notifications.
- Forward message commands to Message Server over authenticated internal HTTP.
- Consume sanitized Message Server Redis events and emit the existing public
  message events.
- Forward call commands and WebRTC authorization to Call Server's private
  realtime bridge. Call business and WebRTC signaling authorization remain in
  Call Server.
- Consume missed-call events from Redis.
- Support Socket.IO polling and WebSocket transports, including the Redis
  adapter for multiple Hub instances.

The Hub never decrypts, parses, logs, or persists Signal ciphertext. It does
not own message, conversation, call, or E2EFE business data.

## Local topology

```text
Gateway       http://127.0.0.1:5000
Auth Server   http://127.0.0.1:5101
Message       http://127.0.0.1:5102
Call Server   http://127.0.0.1:5103
Realtime Hub  http://127.0.0.1:5108
Redis         redis://127.0.0.1:6379
```

The Gateway should use `REALTIME_HUB_URL=http://127.0.0.1:5108`. It should
route calls to `CALL_SERVICE_URL=http://127.0.0.1:5103`. No monolith process is
required or started in the distributed topology.

## Configuration

Copy `.env.example` to `.env` and set real deployment values outside source
control. Required runtime inputs are `REDIS_URL`, `AUTH_SERVICE_URL`,
`MESSAGE_SERVICE_URL`, `CALL_SERVICE_URL`, `JWT_ACCESS_SECRET`,
`JWT_ISSUER`, `JWT_AUDIENCE`, and `INTERNAL_SERVICE_SECRET`. JWT values must
match the existing client-token contract. Internal service values must match
the private bridges; they are not client credentials.

## Development

```powershell
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm start
```

For a real local run, start Redis, Auth Server, Message Server, and Call Server
first, then start this service on port 5108. No client URL or
Socket.IO path change is required.

## Redis and scaling

The Hub uses Redis for the Socket.IO adapter, message/call event subscriptions,
session revocation, presence connection sets, and event de-duplication. Run
all Hub instances against the same Redis deployment. Socket.IO polling clients
need sticky sessions at the edge unless the deployment guarantees that the
handshake and subsequent transport requests reach the same instance. WebSocket
connections remain long-lived and must allow upgrade and idle timeouts suitable
for Socket.IO ping/pong.

The `terqivo:message-events:v1`, `terqivo:call-events:v1`, and
`terqivo:auth:session-revoked:v1` channels are transport contracts for this
phase. Message event envelopes contain metadata and opaque encrypted envelopes;
they must not be logged or transformed into plaintext.

## Failure behavior

Message and call upstream failures are returned as controlled Socket.IO ACK
errors. A call bridge outage does not prevent message commands from operating.
The Hub exposes `/health` for process health and `/ready` for Redis readiness;
these responses never expose internal URLs or secrets. SIGTERM/SIGINT stop new
work and close subscriptions, Socket.IO, HTTP, and Redis resources within the
server's bounded shutdown flow.

## Deployment isolation

This directory is an independently deployable service. Its runtime source and
Dockerfile do not import `apps/api`, another `servers/*` service, or a root
workspace package. The local `package.json`, lockfile, TypeScript configs, and
Dockerfile are sufficient to install/build this service from a copied
directory. Service-to-service communication is HTTP or Redis only.
