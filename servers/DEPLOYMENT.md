# Distributed deployment manifest (documentation only)

This is the deployment contract for the next stage. It contains placeholders
and default local ports only; it does not configure DNS, Coolify, firewalls,
or production secrets.

| Service | Port | Exposure | Health | Readiness | Persistent data |
| --- | ---: | --- | --- | --- | --- |
| Gateway | 5000 | Public | `/health` | `/ready` | None |
| Auth Server | 5101 | Private | `/health` | `/ready` | MongoDB auth collections |
| Message Server | 5102 | Private | `/health` | `/ready` | MongoDB message/community/E2EFE collections |
| Call Server | 5103 | Private | `/health` | `/ready` | MongoDB calls; Redis call TTL/locks |
| Media Server | 5104 | Private | `/health` | `/ready` | Media volume/object storage |
| Notification Server | 5105 | Private | `/health` | `/ready` | MongoDB notifications/devices; Redis queue state |
| Search/AI Server | 5106 | Private | `/health` | `/ready` | No authoritative private-message database |
| Admin Server | 5107 | Private | `/health` | `/ready` | MongoDB admin users/reports |
| Realtime Hub | 5108 | Private backend | `/health` | `/ready` | Redis connection/fan-out state |
| Relationship Server | 5109 | Private | `/health` | `/ready` | MongoDB contacts/blocks |
| Status Server | 5110 | Private | `/health` | `/ready` | MongoDB statuses/views |

MongoDB (`27017`) and Redis (`6379`) are private-only. The former monolith
port `5001` is retired compatibility source, not a production dependency.

## Required configuration categories

- Gateway: service URLs and timeout/trusted-proxy settings.
- Auth: existing JWT-compatible access/refresh configuration, MongoDB, Redis,
  Media/Relationship URLs, and internal JWT settings.
- Message: JWT-compatible verification, MongoDB, Redis, Media/Notification/
  Relationship URLs, and `E2EFE_ENFORCEMENT_ENABLED=true`.
- Call: JWT-compatible verification, MongoDB, Redis, Relationship/Notification
  URLs, and internal JWT settings.
- Media: storage path/object-store settings, MongoDB if metadata is enabled,
  and internal service settings.
- Notification: MongoDB, Redis, provider credentials, and internal settings.
- Search: Auth/Redis and external provider credentials where enabled.
- Admin: MongoDB admin/report data, Auth/Message/Call/Notification URLs, and
  admin/JWT/internal settings.
- Realtime: Redis, Auth/Message/Call URLs, and internal settings.
- Relationship: MongoDB, Auth URL, and internal settings.
- Status: MongoDB, Auth/Relationship/Media URLs, and internal settings.

The public client origin remains `https://api.terqivo.com` for HTTP and
`https://api.terqivo.com/socket.io` for Socket.IO. No client-specific service
URLs are required.
