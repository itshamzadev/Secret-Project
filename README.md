# Terqivo Connect

Terqivo Connect is a cross-platform communication and social application. This repository contains the production-oriented central backend plus the Android, Web, Desktop, iOS-target, and PHP admin foundations. The Node API remains the single application data and authorization boundary.

## Architecture

- `apps/api`: TypeScript + Express API, Socket.IO server, MongoDB/Mongoose integration, Redis integration, validation, logging, middleware, health endpoints, users/authentication/session management, contacts, direct conversations, messages, receipts, presence, calls, and push-device registration/delivery.
- `apps/android`: Expo development-client Android application using Expo Router, TanStack Query, Zustand, Axios, Socket.IO Client, React Hook Form, Zod, SecureStore, and Expo Notifications. It currently contains authentication, contacts, direct chats, text messaging, receipts, typing, presence, calls, and notification routing UI.
- `apps/web`: Vite/React web client foundation using the shared API and realtime packages. Login/session restoration, contacts, direct conversations, and text messaging are connected to the central API.
- `apps/desktop`: Secure Electron desktop foundation. The renderer has no Node access; refresh tokens are encrypted in the main process and direct messaging uses the shared API/realtime packages.
- `apps/admin`: Small PHP 8.2+ server-rendered admin panel. It calls the central Node Admin API and does not own application data.
- `packages/contracts`: Shared API contract package for types, DTOs, enums, and validation schemas. It contains no backend business logic.
- `packages/api-client`: Typed Axios client with coordinated rotating-session refresh for browser/native-style clients.
- `packages/realtime-client`: Shared authenticated Socket.IO client for messaging, presence, typing, receipts, calls, and signaling.
- `infra`: Local Docker Compose infrastructure for MongoDB and Redis.
- `docs`: Reserved for architecture and operational documentation.

The backend uses feature-based modules. The current product phase includes phone-first users, password authentication, access/refresh tokens, session/device management, owner-scoped contacts, direct conversations, text messages, cursor pagination, participant-level delivery/read state, authenticated Socket.IO events, and Redis-backed presence. Future product areas have reserved module folders so feature work can grow without a global controllers/models/routes layout.

## Requirements

- Node.js 24
- pnpm 11
- Docker Desktop with Docker Compose
- PHP 8.2+ for the optional server-rendered admin panel

## Local setup

From the repository root in PowerShell:

```powershell
pnpm install
Copy-Item apps/api/.env.example apps/api/.env
```

Generate two different secrets and replace the corresponding values in `apps/api/.env`:

```powershell
node -e "const crypto=require('node:crypto'); console.log(crypto.randomBytes(48).toString('base64url'))"
```

The API validates all environment configuration with Zod at startup and fails fast with a field-level error when configuration is invalid.

## Infrastructure

Start MongoDB and Redis:

```powershell
pnpm infra:up
```

Check the rendered Compose configuration or view logs:

```powershell
docker compose -f infra/docker-compose.dev.yml config
pnpm infra:logs
```

Stop the services while keeping their named volumes:

```powershell
pnpm infra:down
```

The Node API runs locally and is intentionally not containerized yet.

## Android client foundation

The Android client is a native-ready Expo development-client project. Install
Android Studio, the Android SDK/platform tools, an emulator (or connect a
physical device), and configure `JAVA_HOME` before using native commands. The
current environment can typecheck and test the client, but native `adb` and
emulator commands require that SDK setup.

Create the public client configuration from its example:

```powershell
Copy-Item apps/android/.env.example apps/android/.env
```

The checked-in example targets the current HTTP deployment. For local
development, replace both URLs with the API origin reachable by the device,
for example `http://10.0.2.2:5000/api/v1` and `http://10.0.2.2:5000` in an
Android emulator, or the computer's LAN IP on a physical phone. The temporary
`EXPO_PUBLIC_ALLOW_CLEARTEXT_HTTP=true` setting is only for HTTP testing and
must be removed after HTTPS is enabled.

Start the development client bundler with:

```powershell
pnpm android:dev
```

When Android Studio and the SDK are installed, build/install the native client
with `pnpm --filter @terqivo/android native:prebuild` followed by
`pnpm --filter @terqivo/android android`.

The client keeps the short-lived access JWT only in Zustand memory. The opaque
rotating refresh token is stored in Expo SecureStore and restored on app start.
Axios coordinates concurrent 401 responses through one refresh request, stores
the rotated refresh token, retries the original request, and clears local
credentials when the server rejects the session. Tokens and cookies are never
written to application logs.

Use these client checks from the repository root:

```powershell
pnpm android:typecheck
pnpm android:lint
pnpm android:test
```

Client routes currently include `(auth)/login`, `(auth)/register`,
`(app)/chats`, `(app)/contacts`, `(app)/profile`, and
`chat/[conversationId]`, `(app)/calls`, and `call/[callId]`. Chats and direct
messages remain fully active; calls now use the real backend signaling flow and
video uses the same local WebRTC stream for the tap-to-swap self preview.
Groups, channels, stories, media, videos, and AI remain intentionally locked
future areas.

## Development

After Docker infrastructure is healthy and `apps/api/.env` is configured:

```powershell
pnpm dev
```

The API listens on `http://localhost:5000` by default. The current endpoints are:

- `GET /api/v1/health`: service status and uptime.
- `GET /api/v1/health/live`: process liveness.
- `GET /api/v1/health/ready`: readiness, returning HTTP 503 until MongoDB and Redis are connected.
- `/api/v1/auth`: registration, login, refresh, logout, current-user, and session/device endpoints.
- `/api/v1/contacts`: owner-scoped contact creation, listing, custom-name updates, and removal.
- `/api/v1/conversations`: direct conversation creation/listing and direct text message history, sending, and read cursors.
- `/api/v1/calls`: authenticated one-to-one voice/video call history and call details.
- `/api/v1/admin`: separate admin login, dashboard, and cursor-paginated user read APIs.

## Authentication

Authentication registration requires `username`, `name`, `phone`, and `password`; `email` is optional. Passwords are hashed with Argon2id and are never returned or stored in plaintext. Usernames, phones, and supplied emails are normalized before lookup and protected by MongoDB unique indexes.

Access tokens are short-lived JWTs with issuer, audience, user subject, and session claims. Send them on protected requests with:

```text
Authorization: Bearer <access-token>
```

Refresh tokens are opaque, rotated on every refresh, stored only as HMAC hashes in `auth_sessions`, and also issued in an HttpOnly `terqivo_refresh_token` cookie for browser compatibility. Native clients may send the refresh token in the JSON body to `POST /api/v1/auth/refresh`.

The browser client keeps its short-lived access token in memory and uses the
HttpOnly refresh cookie. The desktop client keeps its refresh token encrypted
through Electron's main-process `safeStorage` API. Shared API and Socket.IO
clients live in `packages/api-client` and `packages/realtime-client`; clients
never connect directly to MongoDB or Redis.

Web and Desktop are login-only clients. They restore existing sessions and
cannot create accounts; account registration remains available only through
the supported account-creation client flow.

Available endpoints:

- `POST /api/v1/auth/register`: create a user and first device session with `{ username, name, phone, password, email? }`.
- `POST /api/v1/auth/login`: authenticate with `{ identifier, password }`.
- `POST /api/v1/auth/refresh`: rotate a refresh token and issue a new access token.
- `POST /api/v1/auth/logout`: revoke the current session.
- `POST /api/v1/auth/logout-all`: revoke every session for the current user.
- `GET /api/v1/auth/me`: return the safe authenticated user DTO.
- `GET /api/v1/auth/sessions`: list the current user's active devices.
- `DELETE /api/v1/auth/sessions/:sessionId`: revoke one owned session.

Registration and login optionally accept `deviceId`, `deviceName`, and a controlled `platform` value (`web`, `android`, `ios`, `windows`, `macos`, `linux`, or `unknown`). The server also records a bounded user-agent and IP address in the private session record.

### Persistent sessions and presence history

The access JWT is intentionally short-lived (15 minutes by default). A successful
refresh rotates the opaque refresh token and moves the session `expiresAt` to
`now + REFRESH_TOKEN_TTL_DAYS`; the default development window is 365 days and
is configurable from 1 to 3,650 days. This is a sliding idle window, not an
infinite token: an active client refreshes normally and remains signed in across
app/browser/device restarts, while a session that is unused beyond the window
must authenticate again. Explicit logout, logout-all, device revocation,
account suspension/disablement, or refresh-token replay ends the session
immediately. `lastUsedAt` and `lastRefreshAt` record session activity.

The Redis presence set is the live source of truth. Heartbeats refresh a
60-second key, and an authenticated user is globally online while at least one
socket is present. MongoDB stores one `UserPresenceSession` for each global
offline-to-online interval, regardless of how many sockets or devices are
connected. The final disconnect closes the record, persists its duration, and
updates `User.lastSeenAt`. A reconnect closes any orphaned open record left by a
crash before starting a new one; the own-history endpoint also reconciles an
open record when Redis says the user is offline.

Authenticated users can read their own recent history with cursor pagination:

- `GET /api/v1/users/me/presence`
- `GET /api/v1/users/:userId/presence` (only the authenticated user's own ID is allowed)

These endpoints return current `isOnline`, `lastSeenAt`, and safe presence
session DTOs. Detailed presence history is not public. Conversation presence
updates contain only `userId`, `isOnline`, status, and `lastSeenAt`, and are sent
only to relevant authenticated conversation participants. The user, session,
and presence schemas are ready for a future admin panel without introducing
denormalized message or conversation counters at this stage.

Example development registration request:

```powershell
$body = @{ username = "alice"; name = "Alice"; phone = "+14155550101"; email = "alice@example.com"; password = "a-long-development-password"; platform = "windows" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/v1/auth/register -ContentType "application/json" -Body $body
```

## Admin API and PHP panel

The Node API exposes a separate `/api/v1/admin` surface for administrative
operations. `AdminUser` documents are stored in MongoDB's `admin_users`
collection, use Argon2id, and are authorized through explicit RBAC permissions.
Admin JWTs use a separate `ADMIN_JWT_SECRET` and are short-lived. Configure that
secret in the server environment and create the first administrator with:

```powershell
pnpm --filter @terqivo/api admin:bootstrap
```

The bootstrap command requires temporary `ADMIN_BOOTSTRAP_EMAIL`,
`ADMIN_BOOTSTRAP_PASSWORD`, and `ADMIN_BOOTSTRAP_DISPLAY_NAME` environment
values. Remove those bootstrap values after the administrator is created.

The initial API endpoints are:

- `POST /api/v1/admin/auth/login`
- `POST /api/v1/admin/auth/logout`
- `GET /api/v1/admin/auth/me`
- `GET /api/v1/admin/dashboard`
- `GET /api/v1/admin/users?limit=25&cursor=<cursor>&search=<term>`

The PHP panel in `apps/admin` calls these APIs using a server-side session. It
does not use MySQL and it never reads MongoDB directly. Run it locally with:

```powershell
Copy-Item apps/admin/.env.example apps/admin/.env
php -S 127.0.0.1:8080 -t apps/admin/public apps/admin/public/index.php
```

Set `ADMIN_API_BASE_URL` in the process environment when the Node API is
deployed elsewhere. The current panel is intentionally read-oriented; future
moderation actions must be added as permission-checked Node API endpoints first.

The full cross-client topology and deployment boundaries are documented in
[`docs/architecture.md`](docs/architecture.md).

## Contacts and direct messaging

Create a directional contact with a username, email, or phone identifier:

```powershell
$contact = @{ identifier = "bob"; customName = "Work Bob" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/v1/contacts -Headers @{ Authorization = "Bearer <access-token>" } -ContentType "application/json" -Body $contact
```

Create or retrieve the one direct conversation for a user pair with `POST
/api/v1/conversations/direct` and `{ userId }`. Send direct text with
`POST /api/v1/conversations/:conversationId/messages` and a unique
`clientMessageId`. Use the returned `nextCursor` with the list/history endpoints
for older records. A recipient can mark a message read with
`POST /api/v1/conversations/:conversationId/read` and
`{ lastReadMessageId }`.

Socket.IO clients authenticate with the same short-lived access token using the
handshake `auth: { token }` object. The current event surface is
`message:send`, `message:new`, `message:sent`, `message:delivered`,
`conversation:read`, `message:read`, `typing:start`, `typing:stop`, and
`presence:update`. User rooms are server-derived from the verified token; client
user IDs are never used for authorization.

## One-to-one calling

Calls use Socket.IO for authenticated control messages and ephemeral WebRTC
offer/answer/ICE signaling. Audio and video RTP flows directly between clients
when possible; the API never proxies media. A controlled TURN relay is required
for reliable production connectivity when direct peer connectivity fails.

The persisted `Call` record contains participant IDs, voice/video type, the
server-authoritative status, timestamps, duration, and a controlled end reason.
It never stores SDP, ICE candidates, media, or TURN credentials. The state
machine is `ringing -> accepted -> ended|failed`; ringing can instead become
`declined`, `cancelled`, or `missed`. Only the caller may cancel, only the
callee may accept or decline, and only participants may end or signal.

Call history is available through `GET /api/v1/calls?limit=20&cursor=<cursor>`
and `GET /api/v1/calls/:callId`. The server owns the no-answer timeout
(`CALL_RING_TIMEOUT_SECONDS`, 35 seconds by default) and uses Redis TTL-backed
active-call reservations so stale processes cannot keep users busy forever.
All active callee devices can ring; the first device to accept wins and the
other devices receive `call:answered-elsewhere`.

`ICE_SERVERS` is validated as JSON by the API and defaults to a development STUN
server. The Android app reads `EXPO_PUBLIC_ICE_SERVERS` from its public client
configuration. Production must provide a controlled Coturn or equivalent TURN
service with short-lived credentials, HTTPS/WSS, suitable firewall rules, and
no secrets committed to source control.

Android calling uses `react-native-webrtc` and `react-native-incall-manager`
behind a dedicated CallManager, WebRTC service, Zustand call store, and call
screen. Microphone permission is requested when starting or accepting a voice
call; video also requests camera permission. Native WebRTC is not expected to
work in Expo Go; use an Expo development build after Android SDK setup.
Incoming calls currently require the app to be running and Socket.IO connected.
Reliable calls while the app is killed require future FCM wake-up and Android
telecom/foreground-service integration.

Tests use the dedicated `terqivo_connect_test` database name and explicitly guard against non-test configuration. They do not drop the normal local database.

## Push notifications

The Android client uses `expo-notifications` in a native development/release
build, creates separate Messages and Calls channels, requests Android 13+
notification permission once after authentication, and registers its Expo push
token with the authenticated API at `POST /api/v1/notifications/devices`.
The token is removed on logout when the server is reachable. Tokens are never
returned in API responses or logged.

The API sends a message push to every enabled device owned by the recipient and
sends an incoming-call push to every enabled callee device. Redis prevents
duplicate delivery attempts for the same message or call. Expo's
`DeviceNotRegistered` ticket response disables the affected token. Foreground
message banners are suppressed only while the exact conversation is open;
Socket.IO remains the realtime transport.

Notification data contains only a message conversation/sender reference or an
incoming-call reference. The Android root layout queues notification taps until
authentication restoration completes, then routes to the conversation or
validates the still-ringing call before opening its call screen. Expired,
cancelled, or already-answered call notifications are ignored.

Remote delivery requires external project configuration that is intentionally
not committed: link the app to an Expo/EAS project, provide its project ID
through `EXPO_PUBLIC_EXPO_PROJECT_ID` or EAS app metadata, configure Android FCM
credentials in EAS, and build a native development/release APK. If the API is
configured to use authenticated Expo Push Service requests, set
`EXPO_ACCESS_TOKEN` only in the server environment. Expo Go on Android cannot
be used to validate remote push notifications for SDK 57.

## Quality commands

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm format
```

Tests use Vitest and Supertest and use the dedicated `terqivo_connect_test`
database. Realtime tests use the local Redis service and Socket.IO client. No
test drops the normal local database.

## Project structure

```text
apps/
  api/
    src/
      config/
      core/
      lib/
      middleware/
      modules/
        health/
        auth/
        users/
        contacts/
        conversations/
        messages/
        groups/
        channels/
        status/
        media/
        calls/
        videos/
        notifications/
        search/
        privacy/
        devices/
        reports/
      sockets/
      app.ts
      server.ts
  android/
    app/
      (auth)/
      (app)/
      chat/[conversationId].tsx
    src/
      api/
      components/
      features/
      lib/
      store/
      theme/
  web/
    src/
  desktop/
    src/
  admin/
    public/
    src/
packages/
  contracts/
  api-client/
  realtime-client/
infra/
docs/
```
#   S e c r e t - P r o j e c t  
 
