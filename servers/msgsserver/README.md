# Messages server

Reserved for conversations, encrypted message routes, realtime events, and
message delivery state. E2EFE enforcement and client-side encryption remain
unchanged during extraction.

The executable migration entrypoint is `server.ts`. It owns conversation and
message REST routes and a message-only Socket.IO namespace on `/messages` using
the `/messages/socket.io` transport path. The existing shared socket server
remains until clients are migrated and the two-device message tests pass.
