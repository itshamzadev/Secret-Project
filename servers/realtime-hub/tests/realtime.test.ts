import { createServer, type Server as HttpServer } from "node:http";

import { SignJWT } from "jose";
import { io as createClient, type Socket } from "socket.io-client";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { env } from "../src/config/env.js";
import { createRealtimeApp } from "../src/app.js";
import { connectRedisRuntime, createRedisRuntime, type RedisRuntime } from "../src/redis/client.js";
import { createRealtimeSocketRuntime, type RealtimeSocketRuntime } from "../src/sockets/connection.js";
import { mockState } from "./setup.js";

const aliceId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const bobId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const activeSockets: Socket[] = [];
const runtimes: Array<{ http: HttpServer; socket: RealtimeSocketRuntime; redis: RedisRuntime }> = [];

afterEach(async () => {
  mockState.messageUnavailable = false;
  mockState.callUnavailable = false;
  const sockets = activeSockets.splice(0);
  await Promise.all(sockets.map(async (socket) => {
    if (!socket.connected) { socket.close(); return; }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 500);
      socket.once("disconnect", () => { clearTimeout(timer); resolve(); });
      socket.close();
    });
  }));
  while (runtimes.length > 0) {
    const runtime = runtimes.pop();
    if (runtime === undefined) continue;
    await runtime.socket.close();
    if (runtime.http.listening) await new Promise<void>((resolve) => runtime.http.close(() => resolve()));
    await runtime.redis.close();
  }
});

async function token(userId = aliceId, sessionId = `session-${userId}`): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
}

async function expiredToken(): Promise<string> {
  return new SignJWT({ sid: "expired-session" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setSubject(aliceId)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
}

async function listen(server: HttpServer): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Server did not expose a port");
  return address.port;
}

async function createRuntime(): Promise<{ baseUrl: string; http: HttpServer; socket: RealtimeSocketRuntime; redis: RedisRuntime }> {
  const redis = createRedisRuntime();
  await connectRedisRuntime(redis);
  const http = createServer(createRealtimeApp(redis));
  const socket = await createRealtimeSocketRuntime(http, redis, ["http://localhost:3000"]);
  const port = await listen(http);
  const result = { baseUrl: `http://127.0.0.1:${port}`, http, socket, redis };
  runtimes.push(result);
  return result;
}

async function connect(baseUrl: string, accessToken: string, transport: "polling" | "websocket" = "websocket"): Promise<Socket> {
  const socket = createClient(baseUrl, { path: "/socket.io", auth: { token: accessToken }, transports: [transport], timeout: 3000, reconnection: false });
  activeSockets.push(socket);
  await new Promise<void>((resolve, reject) => { socket.once("connect", () => resolve()); socket.once("connect_error", reject); });
  return socket;
}

function event(socket: Socket, name: string, timeout = 3000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}`)), timeout);
    socket.once(name, (payload: unknown) => { clearTimeout(timer); resolve(payload); });
  });
}

describe("Realtime Hub health and authentication", () => {
  it("serves health/readiness and accepts polling and websocket JWT sessions", async () => {
    const runtime = await createRuntime();
    expect((await request(createRealtimeApp(runtime.redis)).get("/health")).status).toBe(200);
    expect((await request(createRealtimeApp(runtime.redis)).get("/ready")).status).toBe(200);
    await connect(runtime.baseUrl, await token(), "polling");
    await connect(runtime.baseUrl, await token(bobId, "session-b"), "websocket");
  });

  it("rejects invalid and expired JWTs before connecting", async () => {
    const runtime = await createRuntime();
    for (const value of ["not-a-jwt", await expiredToken()]) {
      const socket = createClient(runtime.baseUrl, { path: "/socket.io", auth: { token: value }, transports: ["websocket"], reconnection: false, timeout: 1000 });
      await expect(new Promise<void>((resolve, reject) => { socket.once("connect", () => resolve()); socket.once("connect_error", () => reject(new Error("rejected"))); })).rejects.toThrow("rejected");
      socket.close();
    }
  });
});

describe("Realtime Hub message transport", () => {
  it("forwards commands, preserves ACKs, emits delivery/read/typing, and rejects unauthorized typing", async () => {
    const runtime = await createRuntime();
    const alice = await connect(runtime.baseUrl, await token());
    const bob = await connect(runtime.baseUrl, await token(bobId, "session-b"));
    const typing = event(bob, "typing:start");
    const messageAck = await new Promise<unknown>((resolve) => alice.emit("message:send", { conversationId: "111111111111111111111111", clientMessageId: "rt-1", type: "text", text: "hello" }, resolve));
    expect(messageAck).toMatchObject({ success: true, data: { duplicate: false } });
    const delivered = event(bob, "message:delivered");
    await new Promise<void>((resolve) => alice.emit("message:delivered", { messageId: "cccccccccccccccccccccccc" }, () => resolve()));
    expect(await delivered).toMatchObject({ receipt: { status: "delivered" } });
    const read = event(bob, "message:read");
    await new Promise<void>((resolve) => alice.emit("conversation:read", { conversationId: "111111111111111111111111", lastReadMessageId: "cccccccccccccccccccccccc" }, () => resolve()));
    expect(await read).toMatchObject({ receipt: { status: "read" } });
    alice.emit("typing:start", { conversationId: "111111111111111111111111" });
    await expect(typing).resolves.toMatchObject({ conversationId: "111111111111111111111111", userId: aliceId });
    const rejected = await new Promise<unknown>((resolve) => alice.emit("typing:start", { conversationId: "000000000000000000000000" }, resolve));
    expect(rejected).toMatchObject({ success: false, error: { code: "CONVERSATION_NOT_FOUND" } });
    expect(mockState.requests).toContain("/internal/messages/send");
  });

  it("fans out each Redis message event once and prevents duplicate deliveries", async () => {
    const runtime = await createRuntime();
    const bob = await connect(runtime.baseUrl, await token(bobId, "session-b"));
    let count = 0;
    bob.on("message:new", () => { count += 1; });
    const raw = JSON.stringify({ kind: "message.created", eventId: "message.created:one:version-1", event: { recipientId: bobId, senderId: aliceId, message: { id: "one", text: null } } });
    await runtime.redis.command.publish("terqivo:message-events:v1", raw);
    await runtime.redis.command.publish("terqivo:message-events:v1", raw);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(count).toBe(1);
  });
});

describe("Realtime Hub calls and failure isolation", () => {
  it("bridges call initiation, incoming notification, WebRTC authorization, and action ACKs", async () => {
    const runtime = await createRuntime();
    const alice = await connect(runtime.baseUrl, await token());
    const bob = await connect(runtime.baseUrl, await token(bobId, "session-b"));
    const incoming = event(bob, "call:incoming");
    const ringing = event(alice, "call:ringing");
    const ack = await new Promise<unknown>((resolve) => alice.emit("call:start", { calleeId: bobId, type: "voice" }, resolve));
    expect(ack).toMatchObject({ success: true, data: { call: { id: "eeeeeeeeeeeeeeeeeeeeeeee" } } });
    expect(await incoming).toMatchObject({ call: { calleeId: bobId }, caller: { id: aliceId } });
    await expect(ringing).resolves.toMatchObject({ call: { callerId: aliceId } });
    const signalAck = await new Promise<unknown>((resolve) => alice.emit("webrtc:offer", { callId: "eeeeeeeeeeeeeeeeeeeeeeee", description: { type: "offer", sdp: "opaque-sdp" } }, resolve));
    expect(signalAck).toMatchObject({ success: true, data: { relayed: true } });
    const acceptAck = await new Promise<unknown>((resolve) => bob.emit("call:accept", { callId: "eeeeeeeeeeeeeeeeeeeeeeee" }, resolve));
    expect(acceptAck).toMatchObject({ success: true, data: { changed: true } });
  });

  it("keeps message transport usable when the call backend is unavailable", async () => {
    const runtime = await createRuntime();
    const alice = await connect(runtime.baseUrl, await token());
    mockState.callUnavailable = true;
    const callAck = await new Promise<unknown>((resolve) => alice.emit("call:start", { calleeId: bobId, type: "voice" }, resolve));
    expect(callAck).toMatchObject({ success: false });
    mockState.callUnavailable = false;
    const messageAck = await new Promise<unknown>((resolve) => alice.emit("message:send", { conversationId: "111111111111111111111111", clientMessageId: "rt-2", type: "text", text: "still works" }, resolve));
    expect(messageAck).toMatchObject({ success: true });
  });
});

describe("Realtime Hub distributed behavior", () => {
  it("routes events between clients on two hub instances through the Redis adapter", async () => {
    const first = await createRuntime();
    const second = await createRuntime();
    const bob = await connect(second.baseUrl, await token(bobId, "session-b"));
    const received = event(bob, "message:new");
    await first.redis.command.publish("terqivo:message-events:v1", JSON.stringify({ kind: "message.created", eventId: "horizontal-event-1", event: { recipientId: bobId, senderId: aliceId, message: { id: "horizontal", text: null } } }));
    await expect(received).resolves.toMatchObject({ message: { id: "horizontal" } });
  });

  it("routes Call Server events between two Hub instances without duplicate delivery", async () => {
    const first = await createRuntime();
    const second = await createRuntime();
    const bob = await connect(second.baseUrl, await token(bobId, "session-b"));
    const received = event(bob, "call:incoming");
    await first.redis.command.publish("terqivo:call-events:v1", JSON.stringify({
      eventId: "call-event-horizontal-1",
      kind: "call:incoming",
      targetUserIds: [bobId],
      caller: { id: aliceId, username: "alice", displayName: "Alice", avatarUrl: null, badges: [] },
      call: { id: "eeeeeeeeeeeeeeeeeeee", type: "voice", callerId: aliceId, calleeId: bobId, status: "ringing", initiatedAt: new Date().toISOString(), answeredAt: null, endedAt: null },
    }));
    await expect(received).resolves.toMatchObject({ call: { id: "eeeeeeeeeeeeeeeeeeee" }, caller: { id: aliceId } });
  });

  it("disconnects sockets when the authenticated session is revoked", async () => {
    const runtime = await createRuntime();
    const socket = await connect(runtime.baseUrl, await token(aliceId, "revoked-session"));
    const disconnected = event(socket, "disconnect");
    await runtime.redis.command.publish("terqivo:auth:session-revoked:v1", "revoked-session");
    await expect(disconnected).resolves.toBe("io server disconnect");
  });
});
