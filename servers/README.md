# Terqivo distributed backend — Phase 14

Phase 14 is the final distributed-runtime cleanup. Production has no legacy
monolith fallback: clients use one public Gateway URL and every supported route
is sent to its owning service. `apps/api` remains source/compatibility only.

```text
Client -> Gateway :5000
  auth/users/profile/avatar/presence/privacy -> Auth :5101
  contacts/blocking -> Relationship :5109
  conversations/messages/groups/channels/e2efe -> Message :5102
  calls -> Call :5103       media -> Media :5104
  notifications -> Notification :5105
  search/ai -> Search :5106 admin/reports -> Admin :5107
  /socket.io -> Realtime Hub :5108      status -> Status :5110
```

Only Gateway is public. MongoDB and Redis are private. There is no
`LEGACY_API_URL` in Gateway and no client-visible service-specific URL.

## Ownership

- Auth owns `users`, `auth_sessions`, `privacy_settings`, and
  `user_presence_sessions`, including unchanged JWT/refresh behavior.
- Relationship owns `contacts` and `user_blocks`.
- Message owns conversations, messages, groups, channels, E2EFE envelopes,
  and message/community references.
- Call owns call records, WebRTC signaling authorization, Redis call locks/TTL,
  and timeout recovery. WebRTC media is not routed through Signal.
- Media owns bytes and upload/download validation; domain services own refs.
- Notification owns `push_devices` and durable notification intents.
- Search owns the audited search/AI APIs and never indexes private message or
  E2EFE content.
- Admin owns `admin_users` and `reports`; dashboard/group/channel/report reads
  use authenticated narrow internal APIs, not foreign Mongo read models.
- Status owns `statuses` and delegates identity, relationship, and bytes over
  authenticated internal HTTP.
- Realtime Hub owns public Socket.IO transport and Redis fan-out. Message and
  Call own business operations behind private bridges.

The existing Mongo collections are retained during transition. Each domain has
one logical writer; remaining compatibility reads are documented in
`SERVICE_BOUNDARIES.md`. No active service performs hidden cross-domain writes.

## Gateway and security

The Gateway explicitly maps all supported public families and owns `/health`,
`/ready`, and `/api/v1/health*`. Unknown paths return 404. HTTP bodies,
cookies, binary uploads, response status/content type, and Socket.IO
polling/WebSocket traffic are proxied opaquely. It never parses message
plaintext, Signal ciphertext, media contents, or call payloads.

Service-to-service calls use short-lived HS256 service JWTs with issuer,
audience, expiry, and explicit allowlists. User access/refresh tokens remain
unchanged. No service token contains passwords, refresh tokens, private keys,
plaintext messages, or ciphertext. E2EFE enforcement and Signal history/session
behavior remain intact.

## Local distributed development

Start private MongoDB/Redis, then each service on the ports in `PORTS.md`:

```powershell
pnpm --filter @terqivo/auth-server dev
pnpm --filter @terqivo/relationship-server dev
pnpm --filter @terqivo/message-server dev
pnpm --filter @terqivo/call-server dev
pnpm --filter @terqivo/media-server dev
pnpm --filter @terqivo/notification-server dev
pnpm --filter @terqivo/search-server dev
pnpm --filter @terqivo/admin-server dev
pnpm --filter @terqivo/realtime-hub dev
pnpm --filter @terqivo/status-server dev
pnpm --filter @terqivo/gateway dev
```

`pnpm run legacy:dev` is an optional migration-test target only. It must not be
publicly exposed or configured as a Gateway upstream.

## Strict deployment isolation

Every active service under `servers/` has its own package metadata, TypeScript
configuration, Dockerfile, and runtime source. Its production build must not
import `apps/api`, another service, or a root workspace business-logic package.
Service communication is HTTP/HTTPS, Redis, or a future broker. A copied
service directory is the deployment unit; the monorepo is only the development
workspace.

The old `callserver`, `msgsserver`, `mediaserver`, `loadbalancer`, and
`adminpanel` directories are preserved prototypes and are not active services.
