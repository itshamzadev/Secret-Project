# Admin Server

Phase 12 extraction of the existing admin authentication, administration,
moderation orchestration, reports, and dashboard API.

The public paths remain `/api/v1/admin/*` and `/api/v1/reports/*`. The Gateway
routes those paths to this service on port 5107. `/api/v1/status/*` remains a
legacy product status feature because it is user/contact/media owned, not an
admin operational API.

`admin_users` and `reports` are owned and written by this service. The service
does not directly read foreign domain collections. Dashboard and report data
comes through narrow authenticated internal APIs owned by Auth, Message, Call,
and Notification. User mutations are sent to Auth Server; group/channel badge
mutations are sent to Message Server using short-lived internal service JWTs.

Run locally from this directory:

```powershell
pnpm install
$env:NODE_ENV='development'; $env:PORT='5107'; pnpm dev
```

No Android, E2EFE, Socket.IO, or WebRTC source is part of this service.
