# Terqivo E2EFE

## End-to-End Full Encryption

Status: **PARTIAL — native artifact is built; two-device runtime validation and
production enforcement are pending**

This document describes the implementation currently in the repository. It is
not a claim that the pre-release system has completed a production security
review.

### Protocol and native boundary

Terqivo E2EFE uses the official Signal `libsignal` Android artifacts:

- `org.signal:libsignal-android:0.102.0`
- `org.signal:libsignal-client:0.102.0`

The versions are pinned as a compatible pair. Signal-specific code is isolated
in the local Expo module at `apps/android/modules/terqivo-e2efe`. The module
exposes a small TypeScript facade and keeps libsignal classes out of React
components and application feature code. The module contains a native proof
entry point that exercises a real Signal session, including tamper and
unrelated-identity rejection checks.

The official Maven repository remains the portable fallback in the Android
build. For this Windows environment, the same official v0.102.0 source was
built in an isolated external checkout and published to an isolated local Maven
repository because the Signal artifact host resets the TLS connection before
certificate exchange. The resulting release APK contains the arm64 Signal JNI
library and the Expo module. This proves packaging, not a two-device runtime
security result.

No custom cryptographic primitives or unofficial Signal wrappers were written.

### Device identity and prekeys

Each installation/account namespace generates and retains its own libsignal
identity key pair, registration ID, device ID, signed prekey, Kyber prekey, and
replenishable one-time-prekey pool. The backend stores only public
identity/prekey material and routing metadata. Active devices are represented
by the `E2EFEDevice` model and one-time prekey bundles are consumed atomically
when requested. The native store uses a separate Keystore-protected
preference namespace per authenticated account, so switching accounts cannot
reuse another account's identity or sessions.

The backend endpoints are:

- `POST /api/v1/e2efe/devices/register`
- `PUT /api/v1/e2efe/devices/:deviceId/prekeys`
- `GET /api/v1/e2efe/users/:userId/devices`
- `GET /api/v1/e2efe/devices/:deviceId/prekey-bundle`
- `DELETE /api/v1/e2efe/devices/:deviceId`

All use the existing authenticated session and conversation/contact access
rules. The server never generates or receives a private key.

### Local key protection

The native store uses an Android Keystore AES-GCM master key to protect the
serialized libsignal identity, session, prekey, and sender-key records stored
in private application preferences. These records are not placed in
AsyncStorage, ordinary SQLite message rows, Zustand persistence, logs, or
Socket.IO payloads. Native crypto calls are exposed as asynchronous Expo-module
operations and serialized inside the module so key/session work does not block
the React Native UI thread or race a concurrent send.

The current fingerprint UI primitive is a SHA-256 digest of the public identity
key. It is a display fingerprint, not a claim of a complete safety-number
workflow. Identity changes are not yet surfaced in a complete user review UI.

### Encrypted message transport

New Android text sends use:

1. The sender loads its local identity and the recipient's active device list.
2. The sender consumes the required public prekey bundle for each destination.
3. The sender encrypts locally through libsignal.
4. The backend receives ciphertext-only device envelopes.
5. MongoDB stores a message metadata record plus ciphertext-only envelope rows.
6. Redis/Socket.IO routes those envelopes to the intended user/device scope.
7. The recipient decrypts through the native module before presentation.

The protocol identifier is `terqivo-e2efe-v1`. Unknown versions are rejected;
there is no silent plaintext fallback in this path. The logical message record
contains no plaintext `text` for encrypted messages. A unique sender/client
message ID remains the idempotency key, and concurrent duplicate inserts are
resolved through the unique index rather than generating a second logical
message.

The public encrypted message endpoint is:

`POST /api/v1/conversations/:conversationId/messages/encrypted`

The Socket.IO equivalent is `message:send-encrypted`, with recipient delivery
through `message:encrypted-new`.

### Multi-device behavior

The sender creates individual ciphertext envelopes for every active recipient
device and for active additional sender devices. The backend does not decrypt
and re-encrypt messages. Revoked devices are excluded from new sends. Device
re-registration preserves the server's remaining one-time prekey list; an
identity, registration ID, or protocol-version change for an existing device
is rejected instead of replacing cryptographic identity state.

The Android sender now creates an envelope for its own active device as well as
each recipient device, so the server response can be reconciled into the
sender's local history. Cold-restart/session restoration still requires a real
device validation run before claiming complete multi-device history behavior.

### Edit, delete, favorites, pins, and clear chat

Existing personal/shared message-management state remains server-authoritative.
Delete-for-me, favorites, personal pins, shared pins, and clear-chat do not
require server decryption. Delete-for-everyone removes displayable content and
leaves a tombstone-shaped metadata record.

Plaintext editing of an E2EFE message is rejected with
`E2EFE_EDIT_REQUIRES_ENCRYPTED_REVISION`. E2EFE edits use an encrypted revision
endpoint and the Android client now prepares a fresh ciphertext envelope for
each active destination. This path still requires native artifact and physical
device validation before it can be called production-complete.

### Cache, previews, and notifications

The ordinary Android messaging cache strips the presentation plaintext from
E2EFE messages before writing SQLite. Encrypted pending operations retain only
ciphertext envelopes. New encrypted push notifications use the generic
`New encrypted message` label and do not contain message text. Conversation
previews are likewise ciphertext-safe; the client may show a generic encrypted
message label until it can decrypt locally.

Existing legacy plaintext messages and the legacy plaintext send endpoint have
not been retroactively converted. They are not represented as E2EFE. During
migration, the legacy route remains available for clients that have not yet
completed E2EFE setup. When enforcement is enabled, a plaintext send is
rejected with `E2EFE_REQUIRED` once both participants have active E2EFE
devices. The legacy route should be removed or explicitly disabled as part of
the final pre-launch cutover after all supported clients use the encrypted
route.

`E2EFE_ENFORCEMENT_ENABLED` defaults to `false` for development and staged
migration. Set it to `true` in production only after native E2EFE validation is
complete; the API then rejects legacy plaintext sends when both participants
have active E2EFE devices.

### Encrypted media transport

New capable Android builds use a two-layer design for image, video, and audio
attachments. Android encrypts the source file with a fresh platform
AES-256-GCM key and IV, then places that key/IV and the original media metadata
inside the libsignal-protected payload. Only the AES-GCM ciphertext is uploaded
to the authenticated staging endpoint:

- `POST /api/v1/conversations/:conversationId/media/encrypted/upload`
- `POST /api/v1/conversations/:conversationId/messages/encrypted-media`

The backend stores the ciphertext under a random `.bin` key and stores only
opaque media metadata on the message. It never receives the media key or
plaintext media. The recipient downloads the ciphertext with authenticated
access and decrypts it locally through the native Android module before
rendering. The backend route is intentionally unable to infer or validate the
inner media type; that metadata is protected by libsignal.

The media staging route has a ciphertext-only backend regression test. A real
Android upload/decrypt/playback run is still pending. Generic file
selection/upload is now wired through the existing Android attachment composer,
but file E2EFE is not claimed complete until a real two-device decrypt/open run
passes. Decrypted media is currently kept in the app cache for the
active presentation lifecycle and needs a dedicated cache-retirement policy
before the local-at-rest story can be called complete.

Calls continue to use the existing WebRTC DTLS-SRTP transport; TURN may relay
encrypted packets, while call signaling metadata remains server-visible.

### Server-visible metadata

The server can still see account and device identifiers, conversation
membership, message IDs, client IDs, message type, sequence/timestamps,
envelope routing destinations, delivery/read state, ciphertext length, and
message-management metadata. E2EFE does not hide this routing metadata.

Approved security wording:

> Terqivo servers do not possess the private cryptographic keys required to
> decrypt E2EFE message content.

This does not mean that old plaintext messages, metadata, media, or call
signaling are retroactively hidden.

### Required validation before COMPLETE

The following are still required:

- run the native A-to-B proof on two Android installations;
- register real device bundles and send/decrypt a real message;
- verify restart/session persistence and tamper/wrong-device failures;
- run the exact plaintext leak test across request, MongoDB, Redis, socket,
  push, logs, and local persistence;
- complete encrypted edit/media coverage and physical-device validation;
- use HTTPS/WSS for production; temporary HTTP cleartext is development-only.

Until these checks pass, E2EFE status must remain **PARTIAL**.
