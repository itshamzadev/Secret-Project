import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { RedisMemoryServer } from "redis-memory-server";
import { createClient } from "redis";

export const mockState = {
  messageUnavailable: false,
  callUnavailable: false,
  requests: [] as string[]
};

const redisServer = await RedisMemoryServer.create({ instance: { port: 0 } });
const mockServer = createServer((request, response) => {
  void handleMockRequest(request, response);
});
const eventPublisher: { client?: ReturnType<typeof createClient> } = {};

async function handleMockRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const path = request.url?.split("?", 1)[0] ?? "/";
  mockState.requests.push(path);
  const unavailable = path.includes("/internal/messages") ? mockState.messageUnavailable : path.includes("/internal/realtime") ? mockState.callUnavailable : false;
  if (unavailable) {
    response.writeHead(503, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ success: false, error: { code: "UPSTREAM_DOWN", message: "upstream unavailable" } }));
    return;
  }
  if (path === "/api/v1/auth/me") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ success: true, data: { user: { id: "aaaaaaaaaaaaaaaaaaaaaaaa" } } }));
    return;
  }
  const body = await readBody(request);
  const input = body.length > 0 ? JSON.parse(body) as Record<string, unknown> : {};
  if (path === "/internal/conversations/typing") {
    const recipientId = input.conversationId === "000000000000000000000000" ? "unauthorized" : "bbbbbbbbbbbbbbbbbbbbbbbb";
    if (recipientId === "unauthorized") {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ success: false, error: { code: "CONVERSATION_NOT_FOUND", message: "Conversation not found." } }));
      return;
    }
    sendJson(response, { recipientId });
    return;
  }
  if (path.includes("/internal/users/") && path.endsWith("/participants")) {
    sendJson(response, { participantIds: ["bbbbbbbbbbbbbbbbbbbbbbbb"] });
    return;
  }
  if (path === "/internal/messages/send" || path === "/internal/messages/send-encrypted") {
    sendJson(response, { message: { id: "cccccccccccccccccccccccc", conversationId: String(input.conversationId ?? ""), senderId: "aaaaaaaaaaaaaaaaaaaaaaaa", text: null }, duplicate: false, recipientId: "bbbbbbbbbbbbbbbbbbbbbbbb", envelopes: [] });
    return;
  }
  if (path === "/internal/messages/delivered") {
    sendJson(response, { receipt: { conversationId: "dddddddddddddddddddddddd", messageId: String(input.messageId ?? ""), senderId: "bbbbbbbbbbbbbbbbbbbbbbbb", recipientId: "aaaaaaaaaaaaaaaaaaaaaaaa", status: "delivered" } });
    return;
  }
  if (path === "/internal/conversations/read") {
    sendJson(response, { receipt: { conversationId: String(input.conversationId ?? ""), messageId: String(input.lastReadMessageId ?? ""), senderId: "bbbbbbbbbbbbbbbbbbbbbbbb", recipientId: "aaaaaaaaaaaaaaaaaaaaaaaa", status: "read" } });
    return;
  }
  if (path === "/internal/realtime/calls/start") {
    const call = { id: "eeeeeeeeeeeeeeeeeeeeeeee", type: input.type === "video" ? "video" : "voice", callerId: "aaaaaaaaaaaaaaaaaaaaaaaa", calleeId: "bbbbbbbbbbbbbbbbbbbbbbbb", status: "ringing", initiatedAt: new Date().toISOString(), answeredAt: null, endedAt: null };
    await eventPublisher.client?.publish("terqivo:call-events:v1", JSON.stringify({ eventId: "call:ringing:test", kind: "call:ringing", targetUserIds: [call.callerId], call }));
    await eventPublisher.client?.publish("terqivo:call-events:v1", JSON.stringify({ eventId: "call:incoming:test", kind: "call:incoming", targetUserIds: [call.calleeId], caller: { id: call.callerId, username: "alice", displayName: "Alice", avatarUrl: null, badges: [] }, call }));
    sendJson(response, { call, changed: true, caller: { id: call.callerId, username: "alice", displayName: "Alice", avatarUrl: null, badges: [] } });
    return;
  }
  if (path.startsWith("/internal/realtime/calls/")) {
    if (path.endsWith("authorize-signal")) { sendJson(response, { otherUserId: "bbbbbbbbbbbbbbbbbbbbbbbb" }); return; }
    if (path.endsWith("session-disconnected")) { sendJson(response, { calls: [] }); return; }
    sendJson(response, { call: { id: "eeeeeeeeeeeeeeeeeeeeeeee", type: "voice", callerId: "aaaaaaaaaaaaaaaaaaaaaaaa", calleeId: "bbbbbbbbbbbbbbbbbbbbbbbb", status: "accepted", initiatedAt: new Date().toISOString(), answeredAt: new Date().toISOString(), endedAt: null }, changed: true });
    return;
  }
  sendJson(response, {});
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function sendJson(response: ServerResponse, data: unknown): void {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ success: true, data }));
}

await new Promise<void>((resolve, reject) => {
  mockServer.once("error", reject);
  mockServer.listen(0, "127.0.0.1", () => { mockServer.removeListener("error", reject); resolve(); });
});
const address = mockServer.address();
if (address === null || typeof address === "string") throw new Error("Mock server did not expose a port");

process.env.NODE_ENV = "test";
process.env.SERVICE_NAME = "realtime-hub-test";
process.env.WEB_ORIGIN = "http://localhost:3000";
const redisHost = await redisServer.getHost();
const redisPort = await redisServer.getPort();
process.env.REDIS_URL = `redis://${redisHost}:${redisPort}`;
eventPublisher.client = createClient({ url: process.env.REDIS_URL });
await eventPublisher.client.connect();
process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${address.port}`;
process.env.MESSAGE_SERVICE_URL = `http://127.0.0.1:${address.port}`;
process.env.CALL_SERVICE_URL = `http://127.0.0.1:${address.port}`;
process.env.JWT_ACCESS_SECRET = "realtime-hub-test-access-secret-0123456789";
process.env.JWT_ISSUER = "terqivo-connect";
process.env.JWT_AUDIENCE = "terqivo-clients";
process.env.INTERNAL_SERVICE_SECRET = "realtime-hub-test-internal-secret-0123456789";

afterAll(async () => {
  if (mockServer.listening) await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  if (eventPublisher.client?.isOpen) await eventPublisher.client.quit();
  await redisServer.stop();
});
