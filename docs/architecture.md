# Terqivo Connect architecture

## Central backend

`apps/api` is the single source of truth for identity, sessions, contacts,
direct conversations, messages, receipts, presence, calls, push devices, and
administration. It is a feature-based Express modular monolith backed by
MongoDB and Redis. Clients do not connect directly to MongoDB, Redis, or the
PHP panel.

`packages/contracts` contains transport DTOs, enums, and payload types only.
`packages/api-client` provides a typed Axios client with coordinated access-token
refresh. `packages/realtime-client` provides the shared authenticated
Socket.IO event surface. These packages are deliberately free of UI and
backend business logic so they can be used by web, desktop, and future iOS
clients.

## Client matrix

| Client | Location | Current foundation |
| --- | --- | --- |
| Android | `apps/android` | Existing Expo/RN messaging, calls, push, and native WebRTC client |
| Web | `apps/web` | Vite/React login, session restoration, conversations, and direct text messaging |
| Desktop | `apps/desktop` | Electron shell with sandboxed renderer, encrypted refresh-token storage, login, and direct messaging |
| iOS | Android Expo app target | iOS bundle/configuration started; native build requires macOS/Xcode |
| Admin | `apps/admin` | PHP server-rendered panel calling Node Admin API only |

## Authentication boundary

End-user clients use short-lived access JWTs and rotating opaque refresh
sessions. Browser refresh tokens remain in an HttpOnly cookie; native and
desktop clients use their secure platform storage. The web access token is kept
in memory. Desktop refresh tokens are encrypted with Electron `safeStorage` in
the main process and exposed to the renderer only through a narrow preload API.

Admin authentication is separate. `AdminUser` documents live in MongoDB's
`admin_users` collection, use Argon2id password hashes, and receive short-lived
admin JWTs signed with `ADMIN_JWT_SECRET`. Admin permissions are checked against
the current MongoDB record on every request. Create the first administrator
with the one-shot `admin:bootstrap` command (or the compiled bootstrap file in
the production container); do not add an admin-create route to the public API.

## Admin data access

The PHP panel has no application database. It calls:

- `POST /api/v1/admin/auth/login`
- `POST /api/v1/admin/auth/logout`
- `GET /api/v1/admin/auth/me`
- `GET /api/v1/admin/dashboard`
- `GET /api/v1/admin/users`

The dashboard uses live counts from existing users, conversations, messages,
calls, push devices, and Redis presence. User listing is cursor-paginated and
returns safe fields only. Future moderation/write endpoints can be added under
the same permission-checked Node module.

## Realtime and calls

Socket.IO authenticates from the same access token and derives user rooms on the
server. Messaging, typing, receipts, presence, call control, and ephemeral
WebRTC signaling remain separate event families. The API never proxies media;
production calling still requires controlled STUN/TURN infrastructure.

## Deployment boundary

The root Dockerfile packages the API and `@terqivo/contracts` for production.
Web and Desktop are independently buildable workspace packages. PHP admin is
deployed as a separate PHP web process and points to the central API using
`ADMIN_API_BASE_URL`. No MySQL dependency is introduced and no application
records are duplicated into the panel.
