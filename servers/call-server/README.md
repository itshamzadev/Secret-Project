# Call Server

Phase 7 owns direct-call history, call lifecycle transitions, participant and
block authorization, WebRTC signaling authorization, Redis active-call locks,
ring timeouts, missed-call events, and call push notifications. It is the only
call business owner in the distributed topology.

## Local topology

```text
Gateway       http://127.0.0.1:5000
Auth Server   http://127.0.0.1:5101
Message       http://127.0.0.1:5102
Call Server   http://127.0.0.1:5103
Realtime Hub  http://127.0.0.1:5108
Redis         redis://127.0.0.1:6379
```

Gateway routes `/api/v1/calls/*` to `CALL_SERVICE_URL`. Realtime Hub sends
call commands and WebRTC authorization to `/internal/realtime/calls/*` using
the existing short-lived service token plus the user's access token where a
user action is required. The public `/socket.io` path remains owned by
Realtime Hub.

## State and compatibility

The service uses the existing MongoDB `calls`, `users`, `auth_sessions`,
`conversations`, `user_blocks`, and `push_devices` collections. This is a
transitional shared-database read model: Auth Server remains the identity
writer, while Call Server performs the same compatibility reads needed for
participant/session/privacy authorization. No duplicate collections or call
schema are introduced.

Redis keys and the `terqivo:call-events:v1` channel are stable transport
contracts. Only Call Server runs call timeout recovery/coordinator in the
distributed topology; no monolith process is required.

## Development

```powershell
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm start
```

Required variables are documented in `.env.example`. JWT settings must match
Auth Server exactly. The service never stores SDP, ICE
candidates, media, or plaintext message data.

## Deployment isolation

This directory is independently deployable. Runtime code, dependencies,
TypeScript configuration, lockfile, and Dockerfile are local to this service;
it does not import `apps/api`, another `servers/*` service, or a workspace
package. Service-to-service communication is HTTP or Redis only.
