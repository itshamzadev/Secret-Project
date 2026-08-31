# Calls

Direct voice and video calls use MongoDB for history and Redis for ephemeral
active-call reservations and no-answer timeout coordination. Socket.IO
forwards only authenticated call control messages and WebRTC offer/answer/ICE
payloads between the two participant user rooms. SDP, ICE candidates, media,
and TURN credentials are never persisted.

The `CallService` owns the state machine and participant authorization. REST
exposes participant-scoped history; Socket.IO exposes the live call contract.
Android owns the native WebRTC peer connection and audio routing through its
dedicated call manager.
