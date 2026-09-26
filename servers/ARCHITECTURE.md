# Terqivo distributed backend: final Phase 14 topology

This document describes the validated distributed runtime. It is an
architecture and deployment reference only; Phase 14 does not deploy or change
DNS.

```text
                         Client applications
                                 |
                       https://api.terqivo.com
                                 |
                         Gateway :5000
      +----------+----------+----+----+----------+----------+
      |          |          |         |          |          |
   Auth       Message      Call      Media   Notification  Search
   :5101       :5102       :5103     :5104      :5105      :5106
      |          |          |         |          |          |
   Admin      Realtime   Relationship             Status
   :5107       :5108       :5109                  :5110

   MongoDB and Redis are private infrastructure dependencies.
   apps/api :5001 is retained source/compatibility code only and is not
   required by the distributed runtime.
```

## Public route ownership

The client uses one origin. The Gateway has an explicit route map and returns a
controlled 404 for an unknown API path; there is no generic or legacy fallback.

| Public path | Owner | Notes |
| --- | --- | --- |
| `/api/v1/auth/*` | Auth | Registration, login, refresh, logout, sessions |
| `/api/v1/users/me/{profile,privacy,avatar,presence}` | Auth | Identity and account settings |
| `/api/v1/users/:userId/{avatar,presence}` | Auth | Privacy-aware identity reads |
| `/api/v1/users/:userId/block` | Relationship | Contact/block policy |
| `/api/v1/contacts/*` | Relationship | Contact management |
| `/api/v1/conversations/*`, `/api/v1/messages/*` | Message | Conversation, message, receipt and media-reference operations |
| `/api/v1/groups/*`, `/api/v1/channels/*` | Message | Community operations |
| `/api/v1/e2efe/*` | Message | Signal device/prekey/encrypted-envelope transport |
| `/api/v1/calls/*` | Call | Call records and lifecycle |
| `/api/v1/media/*` and conversation media paths | Media | Opaque bytes and attachment metadata |
| `/api/v1/notifications/*` | Notification | Device registration and notification APIs |
| `/api/v1/search/*`, `/api/v1/ai/*` | Search | Public search and AI provider boundary |
| `/api/v1/admin/*`, `/api/v1/reports/*` | Admin | Admin identity, moderation and reports |
| `/api/v1/status/*` | Status | Stories/status lifecycle and views |
| `/socket.io/*` | Realtime Hub | The only public Socket.IO owner |
| `/health`, `/ready`, `/api/v1/health*` | Gateway | Safe process/readiness endpoints |

The source inventory in `apps/api/src/app.ts` was checked against this map.
The old route mounts remain only for direct compatibility tests/reference; they
are not started by the distributed production topology.

## Collection ownership

Collection names remain unchanged. Ownership here is logical ownership; the
current transitional deployment can use one MongoDB deployment without making
duplicate collections.

| Collections | Logical owner | Active writers | Transitional readers |
| --- | --- | --- | --- |
| `users`, `auth_sessions`, `privacy_settings`, `user_presence_sessions` | Auth | Auth | Call/Message/Notification identity compatibility reads where required |
| conversations, messages, message user state, groups, channels, channel posts, E2EFE device/envelope/staged-media collections | Message | Message | Call conversation authorization read |
| `calls` | Call | Call | Admin through `/internal/admin/stats` |
| media bytes/storage | Media | Media | Auth/Message/Status through authenticated internal media APIs |
| `push_devices`, `notifications` | Notification | Notification | Admin through `/internal/admin/stats` |
| `contacts`, `user_blocks` | Relationship | Relationship | No active foreign service directly reads these collections |
| status/story collections and view records | Status | Status | Status uses Auth/Relationship/Media APIs |
| `admin_users`, `reports` | Admin | Admin | None |

No active service writes a foreign-owned collection. Message reads `users` for
participant/community DTOs and `auth_sessions` for token compatibility. Call
reads `users`, `auth_sessions`, and `conversations` for participant/session
authorization and call DTOs. Notification reads `users` and `auth_sessions`
only to validate the existing user token contract. These are documented,
read-only transitional dependencies; they do not create a second source of
truth and are future candidates for narrow directory/authorization APIs.
Admin has no foreign Mongo read models.

## Internal service authentication

Internal requests use short-lived HS256 JWTs with the configured issuer,
audience, expiry and a service identity claim. Every internal route validates
the signature and an explicit caller allowlist. The `X-Service-Name` header is
not trusted as authentication.

| Service | Allowed internal callers / purpose |
| --- | --- |
| Auth | Relationship, Search, Status, Admin, Realtime Hub |
| Message | Realtime Hub for bridge operations; Admin for narrow admin reads/writes; Media for media callbacks |
| Call | Realtime Hub for signaling bridge; Admin for stats |
| Media | Message, Auth, Status for authorized file operations |
| Notification | Message, Call for intents; Admin for stats |
| Relationship | Message, Call, Status, Auth for policy/directory calls |
| Realtime Hub | Calls/Message/Auth clients as configured for transport fan-out |

Internal endpoints are narrow domain operations. They do not expose arbitrary
Mongo queries, filesystem paths, proxy targets, password hashes, refresh
tokens, private keys, or Signal plaintext.

## Runtime dependencies and workers

| Service | Runtime dependencies | Sole mutable worker responsibility |
| --- | --- | --- |
| Gateway | Public service HTTP/Socket.IO targets | None |
| Auth | MongoDB, Redis, Media, Relationship | Session/revocation and presence persistence |
| Message | MongoDB, Redis, Relationship, Media, Notification | Message/community persistence and encrypted-envelope state |
| Call | MongoDB, Redis, Relationship, Notification | Call timeout/missed-call recovery |
| Media | Storage and optional MongoDB metadata | Media storage lifecycle |
| Notification | MongoDB, Redis, Expo/provider | Notification queue/receipt delivery |
| Search | Auth, Redis, external search/AI providers | Search cache only |
| Admin | MongoDB admin/report data plus narrow Auth/Message/Call/Notification APIs | None |
| Realtime Hub | Redis, Auth, Message, Call | Socket connection/fan-out state |
| Relationship | MongoDB, Auth | None |
| Status | MongoDB, Auth, Relationship, Media | Status expiry/cleanup |

`apps/api` workers and Socket.IO are not part of distributed startup. Its
legacy flags and bridge code remain only in the retired source tree for
compatibility testing.

## Deployment model

Only Gateway is public. All service ports, MongoDB, and Redis are private. A
service directory contains its own package metadata, lockfile, TypeScript
configuration, source, tests, and Dockerfile, and can be copied as a unit to a
host. Services communicate over authenticated network APIs rather than source
imports.

The next deployment stage must provide the environment-specific service URLs,
MongoDB/Redis credentials, JWT-compatible secrets, internal service secret,
media volume, and provider credentials. No deployment is performed by Phase
14.
