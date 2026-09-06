# Terqivo E2EFE readiness status

## Status

Terqivo Connect is **not E2EFE-enabled**. The current message protocol remains
the legacy authenticated plaintext protocol. No cryptographic cutover was made
in this phase because the repository does not contain a trustworthy,
Expo/Hermes-compatible Signal implementation that can be integrated safely
without designing an unreviewed crypto bridge or protocol.

The Redis test infrastructure in this phase is independent of the messaging
protocol and does not provide, imply, or substitute for encryption.

## Audit findings

The current plaintext boundary is explicit:

- Android sends `text` in REST and Socket.IO `message:send` payloads.
- The API writes the text to the `messages` MongoDB document and returns it in
  `MessageDto`.
- Direct-message push notifications currently derive a preview from the
  message DTO.
- Android's local message cache persists serialized message DTOs in SQLite.
- Realtime and cached conversation previews are based on the existing message
  DTO contract.

These paths must be changed together during a real cutover. Encrypting only
MongoDB, adding a server-side key, or encrypting after the API receives the
message would not be end-to-end encryption and was intentionally not added.

## Library decision

The official Signal `libsignal` project is the credible protocol reference and
contains Android artifacts, but its published `@signalapp/libsignal-client`
package targets Node/desktop platforms rather than Expo/Hermes. A native
bridge to the Android artifacts would need to be designed, implemented, and
validated as a separate native integration. The older JavaScript Signal port
and small third-party React Native wrappers do not meet the maintenance and
trust requirement for silently selecting a production protocol here.

Before implementation, the project needs an explicit choice of a maintained
library and its license/security review. The chosen implementation must cover
device identity, prekeys, sessions/ratchets, multi-device fan-out, encrypted
attachments, encrypted local persistence, trust/key-change UX, and testable
replay/tamper handling.

## Required cutover work

The future E2EFE change must be versioned and fail closed:

1. Generate device identity and prekeys on the client, with private material
   protected by Android Keystore-backed storage.
2. Add authenticated public-key/prekey distribution and device/session records;
   the server must never receive private keys.
3. Replace message text/media fields on the wire with a versioned ciphertext
   envelope. The server must route opaque ciphertext only.
4. Encrypt attachments before upload and decrypt them only on authorized
   devices.
5. Store only encrypted envelopes in MongoDB, Redis, push payloads, logs, and
   local persistence after the cutover boundary.
6. Define legacy-message migration and an explicit incompatible-runtime
   behavior before enabling the feature for existing accounts.
7. Add cross-device and two-device tests for key changes, replay, tampering,
   offline delivery, edits/deletes, reactions, favorites, pins, and clear-chat
   visibility.

Until that work is completed and independently reviewed, product and
deployment documentation must not describe the existing messaging protocol as
end-to-end encrypted.
