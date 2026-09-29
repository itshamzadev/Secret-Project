# Auth/User Server

Phase 4 extracts the authentication and identity profile boundary while using
the existing `users` and `auth_sessions` MongoDB collections. The service is
internal and is reached through the Gateway. Its production source, runtime
dependencies, TypeScript configuration, lockfile, and Docker build context
are all contained in this directory; it does not import `apps/api`, another
service, or a root workspace package.

## Owned routes

- `/api/v1/auth/register`
- `/api/v1/auth/login`
- `/api/v1/auth/username-exists`
- `/api/v1/auth/refresh`
- `/api/v1/auth/logout`
- `/api/v1/auth/logout-all`
- `/api/v1/auth/me`
- `/api/v1/auth/sessions`
- `/api/v1/auth/sessions/:sessionId`
- `/api/v1/users/me/profile`
- `/api/v1/users/me/privacy`
- `/api/v1/users/me/avatar`
- `/api/v1/users/:userId/avatar`
- `/api/v1/users/me/presence`
- `/api/v1/users/:userId/presence`

The JWT algorithm, issuer, audience, claims, TTLs, refresh-token rotation,
Argon2id password hashing, cookie name, and response shapes are unchanged.

Block and contact routes belong to Relationship Server. E2EFE device routes
belong to Message Server, and all Socket.IO traffic belongs to Realtime Hub.
Auth delegates privacy-aware contact checks to Relationship and avatar bytes to
Media without sharing source code or creating duplicate collections.

Auth uses the existing Redis deployment for the dedicated session-revocation
channel. Realtime Hub subscribes to that channel and disconnects matching
Socket.IO sessions; paths, namespaces, events, and the Redis adapter remain
unchanged. Redis is therefore required for Auth Server readiness.

Auth Server trusts a bounded forwarded-proxy chain using
`TRUSTED_PROXY_HOPS`. The production Cloudflare -> Apache -> Gateway -> Auth
Server topology uses `TRUSTED_PROXY_HOPS=2`; do not replace this with
unrestricted `trust proxy=true`.

## Local topology

```text
Gateway       http://127.0.0.1:5000
Auth Server   http://127.0.0.1:5101
Relationship  http://127.0.0.1:5109
Media         http://127.0.0.1:5104
Realtime Hub  http://127.0.0.1:5108
```

Run the Auth Server with the same JWT secrets, MongoDB deployment, and Redis
deployment used by the distributed services. Do not create a second users
collection or change production secrets. The configured auth rate limits remain
enforced at the Auth Server boundary.

## Standalone build

From a copy of this directory on a service host:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
docker build -t terqivo-auth .
```
