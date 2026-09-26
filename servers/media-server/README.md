# `@terqivo/media-server`

Phase 8 self-contained media byte service. It owns physical storage and
streaming of media files; it does not own users, conversations, messages,
groups, channels, status records, or media-reference schemas.

## Active topology

```text
Client -> Gateway :5000 -> Media Server :5104
                         |-> Message Server :5102 (private authorization/finalization API)
                         `-> persistent media volume
```

The Gateway routes `/api/v1/media/*` and direct conversation media upload
paths to this service. Encrypted-media message finalization remains on Message
Server. Other domain routes remain on their existing owners.

## Public-compatible routes

- `POST /api/v1/conversations/:conversationId/media` validates an ordinary
  media body, stores it, and asks Message Server to create the message.
- `POST /api/v1/conversations/:conversationId/media/encrypted/upload` stores
  the body as opaque bytes and asks Message Server to stage it. No file-type
  inspection or decryption is performed for encrypted media.
- `GET /api/v1/media/:storageKey` asks Message Server to authorize access and
  then streams the bytes, including byte ranges.

## Private file API

`/internal/media/files/:storageKey` supports authenticated PUT, GET, and DELETE
for domain services that own avatar/status/message references. Requests require
a short-lived internal service JWT. Storage keys are constrained to generated
UUID-like names with a safe extension; arbitrary filesystem paths are rejected.

## Storage and deployment

Local storage uses `MEDIA_STORAGE_PATH` and should be a persistent volume (the
Docker image exposes `/data/media`). S3/R2 is intentionally not claimed as an
implementation until a real object-storage adapter is introduced. Existing
deployments that already have local media files must mount or migrate that
directory before switching domain services to `MEDIA_SERVICE_URL`.

Required runtime values are documented in `.env.example`. The service connects
to the existing MongoDB deployment only for operational readiness compatibility;
it does not create a media collection. Message/user/community metadata remains
in the existing collections owned by those services.

## Standalone validation

From this directory:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The Dockerfile uses this directory as its complete build context and copies no
root workspace, app, package, or other service source.
