import type { Server as HttpServer } from "node:http";

import { Server, type Socket } from "socket.io";
import { z } from "zod";

import { installSocketAuthentication, type AuthContext } from "../auth/socket-auth.js";
import { RealtimeError } from "../core/errors.js";
import { logger } from "../logging/logger.js";
import type { RedisRuntime } from "../redis/client.js";
import { subscribeChannel, SESSION_REVOKED_CHANNEL } from "../redis/subscriptions.js";
import { getConversationParticipants, authorizeTyping, markDelivered, markRead, sendEncryptedMessage, sendTextMessage } from "../clients/message-server.client.js";
import { recordPresenceEnd, recordPresenceStart } from "../clients/auth-server.client.js";
import { acceptCall, authorizeSignal, cancelCall, declineCall, endCall, failCall, sessionDisconnected, startCall, type CallSignal } from "../clients/call-server.client.js";
import { installRedisAdapter } from "../redis/adapter.js";
import { registerPresence, type PresenceRegistration } from "./presence.js";
import { sessionRoom, userRoom } from "./rooms.js";
import { subscribeCallEvents } from "./calls/events.js";
import { subscribeMessageEvents } from "./messaging/events.js";

type SocketAck<T> = (response: { success: true; data: T } | { success: false; error: { code: string; message: string } }) => void;

const textMessageSchema = z.object({
  conversationId: z.string().regex(/^[a-f\d]{24}$/i),
  clientMessageId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  type: z.literal("text").default("text"),
  text: z.string().trim().min(1).max(4000)
});

const encryptedMessageSchema = z.object({
  conversationId: z.string().regex(/^[a-f\d]{24}$/i),
  clientMessageId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  type: z.literal("text"),
  e2efeVersion: z.literal("terqivo-e2efe-v1"),
  senderDeviceId: z.number().int().min(1).max(127),
  envelopes: z.array(z.object({
    recipientUserId: z.string().regex(/^[a-f\d]{24}$/i),
    recipientDeviceId: z.number().int().min(1).max(127),
    envelopeType: z.union([z.literal(2), z.literal(3)]),
    ciphertext: z.string().trim().min(4).max(2_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/)
  })).min(1).max(128)
});

const deliveredSchema = z.object({ messageId: z.string().regex(/^[a-f\d]{24}$/i) });
const readSchema = z.object({ conversationId: z.string().regex(/^[a-f\d]{24}$/i), lastReadMessageId: z.string().regex(/^[a-f\d]{24}$/i) });
const typingSchema = z.object({ conversationId: z.string().regex(/^[a-f\d]{24}$/i) });
const callStartSchema = z.object({ calleeId: z.string().regex(/^[a-f\d]{24}$/i), type: z.enum(["voice", "video"]) });
const callIdSchema = z.object({ callId: z.string().regex(/^[a-f\d]{24}$/i) });
const descriptionSchema = z.object({ callId: z.string().regex(/^[a-f\d]{24}$/i), description: z.object({ type: z.enum(["offer", "answer"]), sdp: z.string().min(1).max(100_000) }) });
const iceSchema = z.object({ callId: z.string().regex(/^[a-f\d]{24}$/i), candidate: z.object({ candidate: z.string().min(1).max(4096), sdpMid: z.string().max(256).nullable(), sdpMLineIndex: z.number().int().min(0).max(100).nullable() }) });

const validationFailure = { success: false as const, error: { code: "VALIDATION_ERROR", message: "The socket event payload is invalid." } };

function context(socket: Socket): AuthContext {
  if (socket.data.auth === undefined) throw new Error("Socket authentication context is missing");
  return socket.data.auth;
}

function token(socket: Socket): string {
  if (socket.data.accessToken === undefined) throw new RealtimeError("AUTHENTICATION_REQUIRED", "Socket authentication is required.", 401);
  return socket.data.accessToken;
}

function acknowledge<T>(ack: SocketAck<T> | undefined, response: { success: true; data: T } | { success: false; error: { code: string; message: string } }): void {
  if (ack !== undefined) ack(response);
}

function errorResponse(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof RealtimeError) return { success: false, error: { code: error.code, message: error.message } };
  return { success: false, error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } };
}

function logFailure(socket: Socket, event: string, error: unknown): void {
  logger.warn({ socketId: socket.id, userId: socket.data.auth?.userId, event, code: error instanceof RealtimeError ? error.code : "INTERNAL_ERROR" }, "Realtime socket event failed");
}

function installMessageHandlers(io: Server, socket: Socket): void {
  socket.on("message:send", (payload: unknown, ack?: SocketAck<unknown>) => {
    const parsed = textMessageSchema.safeParse(payload);
    if (!parsed.success) { acknowledge(ack, validationFailure); return; }
    void sendTextMessage(context(socket), token(socket), parsed.data)
      .then((result) => acknowledge(ack, { success: true, data: { message: result.message, duplicate: result.duplicate } }))
      .catch((error: unknown) => { logFailure(socket, "message:send", error); acknowledge(ack, errorResponse(error)); });
  });

  socket.on("message:send-encrypted", (payload: unknown, ack?: SocketAck<unknown>) => {
    const parsed = encryptedMessageSchema.safeParse(payload);
    if (!parsed.success) { acknowledge(ack, validationFailure); return; }
    void sendEncryptedMessage(context(socket), token(socket), parsed.data)
      .then((result) => acknowledge(ack, { success: true, data: { message: result.message, envelopes: result.envelopes, duplicate: result.duplicate } }))
      .catch((error: unknown) => { logFailure(socket, "message:send-encrypted", error); acknowledge(ack, errorResponse(error)); });
  });

  socket.on("message:delivered", (payload: unknown, ack?: SocketAck<unknown>) => {
    const parsed = deliveredSchema.safeParse(payload);
    if (!parsed.success) { acknowledge(ack, validationFailure); return; }
    void markDelivered(context(socket), token(socket), parsed.data.messageId)
      .then((result) => { acknowledge(ack, { success: true, data: { receipt: result.receipt } }); io.to(userRoom(result.receipt.senderId)).emit("message:delivered", { receipt: result.receipt }); })
      .catch((error: unknown) => { logFailure(socket, "message:delivered", error); acknowledge(ack, errorResponse(error)); });
  });

  socket.on("conversation:read", (payload: unknown, ack?: SocketAck<unknown>) => {
    const parsed = readSchema.safeParse(payload);
    if (!parsed.success) { acknowledge(ack, validationFailure); return; }
    void markRead(context(socket), token(socket), parsed.data)
      .then((result) => { acknowledge(ack, { success: true, data: { receipt: result.receipt } }); io.to(userRoom(result.receipt.senderId)).emit("message:read", { receipt: result.receipt }); })
      .catch((error: unknown) => { logFailure(socket, "conversation:read", error); acknowledge(ack, errorResponse(error)); });
  });
}

function installTypingHandlers(socket: Socket): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const handle = (event: "typing:start" | "typing:stop", payload: unknown, ack?: SocketAck<unknown>): void => {
    const parsed = typingSchema.safeParse(payload);
    if (!parsed.success) { acknowledge(ack, validationFailure); return; }
    void authorizeTyping(context(socket), token(socket), parsed.data.conversationId)
      .then((result) => {
        const typingPayload = { conversationId: parsed.data.conversationId, userId: context(socket).userId };
        socket.nsp.to(userRoom(result.recipientId)).emit(event, typingPayload);
        const key = `${context(socket).userId}:${parsed.data.conversationId}`;
        const current = timers.get(key);
        if (current !== undefined) clearTimeout(current);
        if (event === "typing:start") {
          timers.set(key, setTimeout(() => { socket.nsp.to(userRoom(result.recipientId)).emit("typing:stop", typingPayload); timers.delete(key); }, 5_000));
        } else {
          timers.delete(key);
        }
        acknowledge(ack, { success: true, data: { accepted: true } });
      })
      .catch((error: unknown) => { logFailure(socket, event, error); acknowledge(ack, errorResponse(error)); });
  };
  socket.on("typing:start", (payload: unknown, ack?: SocketAck<unknown>) => handle("typing:start", payload, ack));
  socket.on("typing:stop", (payload: unknown, ack?: SocketAck<unknown>) => handle("typing:stop", payload, ack));
  return () => { for (const timer of timers.values()) clearTimeout(timer); timers.clear(); };
}

function installCallHandlers(io: Server, socket: Socket): void {
  const action = (event: "call:accept" | "call:decline" | "call:cancel" | "call:end" | "call:fail", operation: (callId: string) => Promise<{ call: CallSignal; changed: boolean }>): void => {
    socket.on(event, (payload: unknown, ack?: SocketAck<unknown>) => {
      const parsed = callIdSchema.safeParse(payload);
      if (!parsed.success) { acknowledge(ack, validationFailure); return; }
      void operation(parsed.data.callId)
        .then((result) => {
          acknowledge(ack, { success: true, data: { call: result.call, changed: result.changed } });
          if (!result.changed) {
            if (event === "call:accept") socket.emit("call:answered-elsewhere", { callId: result.call.id, type: result.call.type });
            return;
          }
          // Call Server publishes the state transition on the shared call
          // event channel. The hub only acknowledges the command here; this
          // prevents duplicate events when multiple hubs are running.
        })
        .catch((error: unknown) => { logFailure(socket, event, error); acknowledge(ack, errorResponse(error)); });
    });
  };

  socket.on("call:start", (payload: unknown, ack?: SocketAck<unknown>) => {
    const parsed = callStartSchema.safeParse(payload);
    if (!parsed.success) { acknowledge(ack, validationFailure); return; }
    void startCall(context(socket), token(socket), parsed.data)
      .then((result) => { acknowledge(ack, { success: true, data: { call: result.call } }); })
      .catch((error: unknown) => { logFailure(socket, "call:start", error); acknowledge(ack, errorResponse(error)); });
  });

  action("call:accept", (callId) => acceptCall(context(socket), token(socket), callId));
  action("call:decline", (callId) => declineCall(context(socket), token(socket), callId));
  action("call:cancel", (callId) => cancelCall(context(socket), token(socket), callId));
  action("call:end", (callId) => endCall(context(socket), token(socket), callId));
  action("call:fail", (callId) => failCall(context(socket), token(socket), callId));

  const relay = (event: "webrtc:offer" | "webrtc:answer" | "webrtc:ice-candidate", kind: "offer" | "answer" | "ice", schema: z.ZodType<Record<string, unknown>>): void => {
    socket.on(event, (payload: unknown, ack?: SocketAck<{ relayed: boolean }>) => {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) { acknowledge(ack, validationFailure); return; }
      const data = parsed.data as { callId: string } & Record<string, unknown>;
      void authorizeSignal(context(socket), token(socket), data.callId, kind)
        .then((target) => { io.to(userRoom(target.otherUserId)).emit(event, data); acknowledge(ack, { success: true, data: { relayed: true } }); })
        .catch((error: unknown) => { logFailure(socket, event, error); acknowledge(ack, errorResponse(error)); });
    });
  };
  relay("webrtc:offer", "offer", descriptionSchema);
  relay("webrtc:answer", "answer", descriptionSchema);
  relay("webrtc:ice-candidate", "ice", iceSchema);
}

export interface RealtimeSocketRuntime {
  io: Server;
  close: () => Promise<void>;
}

export async function createRealtimeSocketRuntime(httpServer: HttpServer, redis: RedisRuntime, corsOrigins: string[]): Promise<RealtimeSocketRuntime> {
  const io = new Server(httpServer, { path: "/socket.io", cors: { origin: corsOrigins, credentials: true }, transports: ["polling", "websocket"] });
  let closing = false;
  installRedisAdapter(io, redis);
  installSocketAuthentication(io);
  const closeMessageEvents = await subscribeMessageEvents(io, redis);
  const sessionSockets = new Map<string, Set<Socket>>();
  const closeCallEvents = await subscribeCallEvents(io, redis);
  const presenceBySocket = new Map<string, PresenceRegistration>();
  const closeRevocations = await subscribeChannel(redis, SESSION_REVOKED_CHANNEL, (sessionId) => {
    for (const socket of sessionSockets.get(sessionId) ?? []) socket.disconnect(true);
  });

  io.on("connection", (socket) => {
    const auth = context(socket);
    const tokenValue = token(socket);
    socket.join(userRoom(auth.userId));
    socket.join(sessionRoom(auth.sessionId));
    const sockets = sessionSockets.get(auth.sessionId) ?? new Set<Socket>();
    sockets.add(socket);
    sessionSockets.set(auth.sessionId, sockets);
    const typingCleanup = installTypingHandlers(socket);
    installMessageHandlers(io, socket);
    installCallHandlers(io, socket);
    void registerPresence(redis, auth.userId, socket.id)
      .then(async (presence) => {
        presenceBySocket.set(socket.id, presence);
        if (presence.becameOnline) {
          try {
            await recordPresenceStart(auth.userId, auth.sessionId);
            const participants = await getConversationParticipants(auth.userId);
            if (!closing && redis.adapterPub.isReady) {
              for (const participantId of participants.participantIds) io.to(userRoom(participantId)).emit("presence:update", { userId: auth.userId, isOnline: true, status: "online", lastSeenAt: null });
            }
          } catch (error: unknown) { logger.warn({ userId: auth.userId, err: error }, "Realtime online fan-out unavailable"); }
        }
      })
      .catch((error: unknown) => { logger.error({ socketId: socket.id, userId: auth.userId, err: error }, "Realtime presence registration failed"); socket.disconnect(true); });

    socket.on("disconnect", () => {
      typingCleanup();
      const registration = presenceBySocket.get(socket.id);
      presenceBySocket.delete(socket.id);
      if (registration !== undefined) void registration.stop().then(async (result) => {
        if (result.becameOffline) {
          try {
            await recordPresenceEnd(auth.userId);
            const participants = await getConversationParticipants(auth.userId);
            if (!closing && redis.adapterPub.isReady) {
              for (const participantId of participants.participantIds) io.to(userRoom(participantId)).emit("presence:update", { userId: auth.userId, isOnline: false, status: "offline", lastSeenAt: new Date().toISOString() });
            }
          } catch (error: unknown) { logger.warn({ userId: auth.userId, err: error }, "Realtime offline fan-out unavailable"); }
        }
      }).catch((error: unknown) => logger.warn({ socketId: socket.id, err: error }, "Realtime presence cleanup failed"));
      const current = sessionSockets.get(auth.sessionId);
      current?.delete(socket);
      if (current !== undefined && current.size === 0) sessionSockets.delete(auth.sessionId);
      void redis.command.sRem(`realtime:session:${auth.sessionId}:connections`, socket.id).then(async () => {
        const remaining = await redis.command.sCard(`realtime:session:${auth.sessionId}:connections`);
        if (remaining === 0) {
          await redis.command.del(`realtime:session:${auth.sessionId}:connections`);
          if (!closing) await sessionDisconnected(auth.sessionId).catch((error: unknown) => logger.warn({ sessionId: auth.sessionId, err: error }, "Call Server disconnect bridge unavailable"));
        }
      }).catch((error: unknown) => logger.warn({ sessionId: auth.sessionId, err: error }, "Realtime session connection cleanup failed"));
    });
    void redis.command.sAdd(`realtime:session:${auth.sessionId}:connections`, socket.id).catch((error: unknown) => logger.warn({ sessionId: auth.sessionId, err: error }, "Realtime session connection accounting failed"));
    void tokenValue;
  });

  return {
    io,
    close: async () => {
      closing = true;
      await closeRevocations();
      await closeMessageEvents();
      await closeCallEvents();
      await io.close();
    }
  };
}
