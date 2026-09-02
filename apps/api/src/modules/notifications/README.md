# Notifications

This module owns authenticated Expo push-device registration and server-side
push delivery for direct messages, incoming calls, and missed calls.

The API stores only Expo push tokens, never provider private keys. Expo ticket
responses are checked immediately and receipts are checked asynchronously;
tokens reported as `DeviceNotRegistered` are disabled.

The Android client owns notification channels and routes safe notification
metadata after authentication/session restoration. FCM V1 credentials remain
configured in EAS and are never included in the application or API logs.
