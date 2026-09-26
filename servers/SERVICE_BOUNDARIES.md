# Service boundary map — Phase 14

| Domain | Active owner | Collections / writes | Notes |
| --- | --- | --- | --- |
| Auth, users, profile, privacy, presence | Auth Server | `users`, `auth_sessions`, `privacy_settings`, `user_presence_sessions` | JWT/refresh contracts unchanged. |
| Contacts, blocking, relationship policy | Relationship Server | `contacts`, `user_blocks` | Identity facts from Auth internal HTTP. |
| Conversations, messages, groups, channels, E2EFE | Message Server | Existing message/community/E2EFE collections | Envelopes stay opaque; compatibility user reads are read-only. |
| Public Socket.IO transport | Realtime Hub | Redis ephemeral connection sets/events | `/socket.io`, namespaces, event names and ACKs unchanged. Durable presence is written by Auth. |
| Calls/WebRTC signaling | Call Server | `calls`, Redis call locks/TTL | Narrow authorization compatibility reads; no call media through Signal. |
| Media | Media Server | Media bytes/storage | Domain services keep references and use private Media APIs. |
| Notifications | Notification Server | `push_devices`, `notifications` | Message/Call submit safe intents; worker/provider is owned here. |
| Search/AI | Search Server | No private domain collections | No private message/E2EFE indexing. |
| Admin | Admin Server | `admin_users` | Dashboard/group/channel reads use internal service APIs. |
| Reports | Admin Server | `reports` | Target validation from Message; display identity from Auth. |
| Status/Stories | Status Server | `statuses` | Auth/Relationship/Media are authenticated dependencies. |
| Health | Gateway/service-owned | None | Gateway owns `/health`, `/ready`, `/api/v1/health*`; each service owns its operational endpoints. |

## Public route map

```text
/api/v1/auth/*                         -> AUTH_SERVICE_URL
/api/v1/users/*                        -> AUTH_SERVICE_URL
/api/v1/contacts/*                     -> RELATIONSHIP_SERVICE_URL
/api/v1/users/:userId/block            -> RELATIONSHIP_SERVICE_URL
/api/v1/conversations/*                -> MESSAGE_SERVICE_URL
/api/v1/messages/*                     -> MESSAGE_SERVICE_URL
/api/v1/groups/*                       -> MESSAGE_SERVICE_URL
/api/v1/channels/*                     -> MESSAGE_SERVICE_URL
/api/v1/e2efe/*                        -> MESSAGE_SERVICE_URL
/api/v1/calls/*                        -> CALL_SERVICE_URL
/api/v1/media/*                        -> MEDIA_SERVICE_URL
/api/v1/notifications/*                -> NOTIFICATION_SERVICE_URL
/api/v1/search/*, /api/v1/ai/*         -> SEARCH_SERVICE_URL
/api/v1/admin/*, /api/v1/reports/*     -> ADMIN_SERVICE_URL
/api/v1/status/*                       -> STATUS_SERVICE_URL
/socket.io/*                           -> REALTIME_HUB_URL
/health, /ready, /api/v1/health*       -> Gateway-owned
```

There is no legacy target, generic proxy, or unknown-path fallback.

## Database and compatibility

The existing Mongo deployment and collection names remain unchanged. Auth is
the logical writer for identity/account collections. Message and Call retain
documented compatibility reads needed for authorization and DTO enrichment,
and Notification validates user/session state against the same transitional
identity collections. These reads are read-only; active services do not write
another domain's collection. Admin contains no read models for
`users`, `auth_sessions`, `groups`, `channels`, `conversations`, `messages`,
`calls`, or `push_devices`; it calls narrow internal APIs instead.

Remaining transitional foreign reads are deliberately limited to:

- Message Server reads `users` for participant/community DTOs and
  `auth_sessions` for JWT session compatibility.
- Call Server reads `users`, `auth_sessions`, and `conversations` for call
  participant/session authorization and call DTOs.
- Notification Server reads `users` and `auth_sessions` only to validate the
  existing user access-token contract before operating its own collections.

These reads are candidates for later directory/authorization APIs. They are
not hidden writes, do not duplicate collections, and do not make `apps/api` a
runtime dependency.

`packages/auth-core` remains only because retired `apps/api` compatibility
source imports it. No active service imports it.

## Retirement and isolation

`apps/api/RETIRED.md` marks the monolith as source/compatibility only. It is not
started by distributed production, not a Gateway fallback, and not a public
upstream. Its route mounts remain for direct legacy tests and rollback tooling.

Every active `servers/*` service is intended to be copied, installed,
typechecked, tested, built, and deployed from its own directory. Services must
never import another service's source or a root workspace business-logic
package; communication uses network protocols or infrastructure.
