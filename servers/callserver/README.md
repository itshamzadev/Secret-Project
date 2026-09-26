# Call server

Reserved for call signalling and WebRTC coordination. Keep TURN credentials,
Socket.IO/WebSocket handling, and call lifecycle contracts compatible with the
current API before extracting code from `apps/api`.

The executable migration entrypoint is `server.js`. It owns call history REST
routes and a call-only Socket.IO namespace on `/calls` using the
`/calls/socket.io` transport path.

The call-specific model, validation, DTO, service, timeout, REST, and
Socket.IO code now lives in the single bundled `server.js` file; it no longer imports
`apps/api/src/modules/calls/*`. Android routes call realtime traffic through
the `/calls` namespace and `/calls/socket.io` path. The old API call handlers
remain temporarily for rollback and existing backend tests until the
production load balancer and two-device call smoke test are complete.
