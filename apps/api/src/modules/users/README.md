# Users

Phase 1 provides the `User` model, username normalization and uniqueness,
required normalized phone uniqueness, optional email normalization and
uniqueness, account status and role fields, and safe user DTO mapping. Password
hashes are selected out of normal queries and are never included in response
DTOs.

Future profile, contacts, privacy, and moderation behavior should remain feature-local as those modules are implemented.

## Presence history

`UserPresenceSession` stores durable global online intervals. The socket layer
uses a Redis connection set with a 60-second TTL and 20-second heartbeats. The
first authenticated socket creates the online transition; additional sockets
and devices do not create duplicate active records. Only the final active
socket closes the record and updates `User.lastSeenAt`.

If Redis or the API crashes, the Redis key expires. On a later reconnect, or
when the authenticated owner reads presence history while Redis reports
offline, an orphaned open Mongo record is safely closed. Detailed history is
owner-only through `/api/v1/users/me/presence` (cursor pagination) or the
equivalent self-ID route; it is not exposed as a public user lookup.
