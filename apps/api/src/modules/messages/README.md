# Messages

Phase 2 currently accepts direct text messages only. Every message has a
server-side sequence and a client-provided idempotency key scoped to the sender.
Message history uses cursor pagination, while delivery/read state is represented
by participant cursors on the conversation.

REST routes are mounted below `/api/v1/conversations/:conversationId`. Socket.IO
clients may use `message:send`, `message:delivered`, `conversation:read`, and
the ephemeral `typing:start`/`typing:stop` events.
