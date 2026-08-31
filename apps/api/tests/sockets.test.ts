import { createServer, type Server as HttpServer } from "node:http";

import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { connectRedis, disconnectRedis } from "../src/lib/redis.js";
import { UserModel } from "../src/modules/users/user.model.js";
import { UserPresenceSessionModel } from "../src/modules/users/user-presence-session.model.js";
import {
  createSocketServer,
  type SocketRuntime,
} from "../src/sockets/index.js";
import {
  authData,
  authHeader,
  clearTestData,
  connectTestData,
  disconnectTestData,
  registerPayload,
} from "./test-helpers.js";
import { isUserOnline } from "../src/sockets/presence.js";

const app = createApp();
let httpServer: HttpServer;
let socketRuntime: SocketRuntime;
let serverUrl: string;

async function register(overrides: Parameters<typeof registerPayload>[0] = {}) {
  return request(app)
    .post("/api/v1/auth/register")
    .send(registerPayload(overrides));
}

function connectClient(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const client = io(serverUrl, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
    });
    const timeout = setTimeout(() => {
      client.close();
      reject(new Error("Socket connection timed out"));
    }, 3_000);
    client.once("connect", () => {
      clearTimeout(timeout);
      resolve(client);
    });
    client.once("connect_error", (error: Error) => {
      clearTimeout(timeout);
      client.close();
      reject(error);
    });
  });
}

function waitForEvent(socket: Socket, event: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${event}`));
    }, 3_000);
    socket.once(event, (data: unknown) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
}

function emitWithAck(
  socket: Socket,
  event: string,
  payload: unknown,
): Promise<unknown> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (response: unknown) => resolve(response));
  });
}

async function closeClient(client: Socket): Promise<void> {
  if (!client.connected) {
    client.close();
    return;
  }

  await new Promise<void>((resolve) => {
    client.once("disconnect", () => resolve());
    client.close();
  });
}

async function waitForCondition(
  description: string,
  condition: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (await condition()) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

describe("authenticated realtime communication", () => {
  beforeAll(async () => {
    await connectTestData();
    await connectRedis();
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, "127.0.0.1", () => resolve());
    });
    const address = httpServer.address();
    if (address === null || typeof address === "string") {
      throw new Error("Socket test server did not expose a TCP address");
    }
    serverUrl = `http://127.0.0.1:${address.port}`;
    socketRuntime = await createSocketServer(httpServer);
  });

  beforeEach(clearTestData);

  afterAll(async () => {
    await socketRuntime.close();
    if (httpServer.listening) {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      });
    }
    await disconnectTestData();
    await disconnectRedis();
  });

  it("authenticates sockets and routes message, receipt, and typing events", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.Example",
        name: "Bob Example",
        phone: "+14155550102",
        email: "bob@example.com",
      }),
    );
    const conversation = await request(app)
      .post("/api/v1/conversations/direct")
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.user.id });
    const conversationId = conversation.body.data.conversation.id as string;
    const aliceSocket = await connectClient(alice.accessToken);
    const bobSocket = await connectClient(bob.accessToken);

    const incomingPromise = waitForEvent(bobSocket, "message:new");
    const sentAck = await emitWithAck(aliceSocket, "message:send", {
      conversationId,
      clientMessageId: "socket-message-1",
      type: "text",
      text: "Hello over Socket.IO",
    });
    const incoming = (await incomingPromise) as {
      message: { id: string; text: string };
    };
    const sent = sentAck as {
      success: boolean;
      data: { message: { id: string } };
    };
    expect(sent.success).toBe(true);
    expect(incoming.message.text).toBe("Hello over Socket.IO");

    const deliveredPromise = waitForEvent(aliceSocket, "message:delivered");
    const deliveredAck = await emitWithAck(bobSocket, "message:delivered", {
      messageId: incoming.message.id,
    });
    const delivered = deliveredAck as { success: boolean };
    await deliveredPromise;
    expect(delivered.success).toBe(true);

    const readPromise = waitForEvent(aliceSocket, "message:read");
    const readAck = await emitWithAck(bobSocket, "conversation:read", {
      conversationId,
      lastReadMessageId: incoming.message.id,
    });
    const read = readAck as { success: boolean };
    await readPromise;
    expect(read.success).toBe(true);

    const typingPromise = waitForEvent(bobSocket, "typing:start");
    const typingAck = await emitWithAck(aliceSocket, "typing:start", {
      conversationId,
    });
    const typing = typingAck as { success: boolean };
    await typingPromise;
    expect(typing.success).toBe(true);

    await closeClient(aliceSocket);
    await closeClient(bobSocket);
  });

  it("tracks one global presence session across multiple sockets", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.Example",
        name: "Bob Example",
        phone: "+14155550102",
        email: "bob@example.com",
      }),
    );

    await request(app)
      .post("/api/v1/conversations/direct")
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.user.id });
    const bobSocket = await connectClient(bob.accessToken);
    const onlineEventPromise = waitForEvent(bobSocket, "presence:update");
    const firstSocket = await connectClient(alice.accessToken);
    await waitForCondition("Alice to become online", async () => {
      return (
        (await isUserOnline(alice.user.id)) &&
        (await UserPresenceSessionModel.countDocuments({
          userId: alice.user.id,
          endedAt: null,
        })) === 1
      );
    });
    const onlineEvent = (await onlineEventPromise) as {
      userId: string;
      isOnline: boolean;
      lastSeenAt: string | null;
    };
    expect(onlineEvent).toMatchObject({
      userId: alice.user.id,
      isOnline: true,
      lastSeenAt: null,
    });

    const firstRecord = await UserPresenceSessionModel.findOne({
      userId: alice.user.id,
      endedAt: null,
    }).exec();
    expect(firstRecord).not.toBeNull();

    const secondSocket = await connectClient(alice.accessToken);
    await waitForCondition(
      "Alice to retain one active presence session",
      async () => {
        return (
          (await isUserOnline(alice.user.id)) &&
          (await UserPresenceSessionModel.countDocuments({
            userId: alice.user.id,
            endedAt: null,
          })) === 1
        );
      },
    );
    expect(
      await UserPresenceSessionModel.countDocuments({ userId: alice.user.id }),
    ).toBe(1);

    await closeClient(firstSocket);
    await waitForCondition(
      "Alice to remain online on the second socket",
      async () => {
        return (
          (await isUserOnline(alice.user.id)) &&
          (await UserPresenceSessionModel.countDocuments({
            userId: alice.user.id,
            endedAt: null,
          })) === 1
        );
      },
    );

    const offlineEventPromise = waitForEvent(bobSocket, "presence:update");
    await closeClient(secondSocket);
    const offlineEvent = (await offlineEventPromise) as {
      userId: string;
      isOnline: boolean;
      lastSeenAt: string | null;
    };
    expect(offlineEvent).toMatchObject({
      userId: alice.user.id,
      isOnline: false,
    });
    expect(offlineEvent.lastSeenAt).toEqual(expect.any(String));
    await waitForCondition("Alice to become offline", async () => {
      return (
        !(await isUserOnline(alice.user.id)) &&
        (await UserPresenceSessionModel.countDocuments({
          userId: alice.user.id,
          endedAt: null,
        })) === 0
      );
    });

    const closedRecord = await UserPresenceSessionModel.findById(
      firstRecord?._id,
    ).exec();
    expect(closedRecord?.endedAt).not.toBeNull();
    expect(closedRecord?.durationSeconds).toBeGreaterThanOrEqual(0);
    expect(
      (await UserModel.findById(alice.user.id).exec())?.lastSeenAt,
    ).not.toBe(null);

    const reconnectedSocket = await connectClient(alice.accessToken);
    await waitForCondition(
      "Alice to start a new presence session",
      async () => {
        return (
          (await isUserOnline(alice.user.id)) &&
          (await UserPresenceSessionModel.countDocuments({
            userId: alice.user.id,
            endedAt: null,
          })) === 1 &&
          (await UserPresenceSessionModel.countDocuments({
            userId: alice.user.id,
          })) === 2
        );
      },
    );
    await closeClient(reconnectedSocket);
    await waitForCondition(
      "Alice to finish the reconnected presence session",
      async () => {
        return !(await isUserOnline(alice.user.id));
      },
    );
    await closeClient(bobSocket);

    const ownHistory = await request(app)
      .get("/api/v1/users/me/presence")
      .set(authHeader(alice.accessToken));
    const otherHistory = await request(app)
      .get(`/api/v1/users/${bob.user.id}/presence`)
      .set(authHeader(alice.accessToken));

    expect(ownHistory.status).toBe(200);
    expect(ownHistory.body.data.sessions).toHaveLength(2);
    expect(ownHistory.body.data.sessions[0]).not.toHaveProperty("userId");
    expect(otherHistory.status).toBe(404);
    expect(otherHistory.body.error.code).toBe("PRESENCE_NOT_FOUND");
  });

  it("reconciles an orphaned Mongo presence record when Redis is offline", async () => {
    const alice = authData(await register());
    const startedAt = new Date(Date.now() - 5_000);
    const orphaned = await UserPresenceSessionModel.create({
      userId: alice.user.id,
      startedAt,
      endedAt: null,
      durationSeconds: 0,
      deviceId: null,
      platform: null,
    });

    const response = await request(app)
      .get("/api/v1/users/me/presence")
      .set(authHeader(alice.accessToken));
    const recovered = await UserPresenceSessionModel.findById(
      orphaned._id,
    ).exec();

    expect(response.status).toBe(200);
    expect(response.body.data.isOnline).toBe(false);
    expect(recovered?.endedAt).not.toBeNull();
    expect(recovered?.durationSeconds).toBeGreaterThanOrEqual(5);
  });

  it("disconnects a live socket when its session is explicitly revoked", async () => {
    const alice = authData(await register());
    const socket = await connectClient(alice.accessToken);
    await waitForCondition("Alice to become online", async () => {
      return isUserOnline(alice.user.id);
    });

    const disconnected = new Promise<void>((resolve) => {
      socket.once("disconnect", () => resolve());
    });
    const logout = await request(app)
      .post("/api/v1/auth/logout")
      .set(authHeader(alice.accessToken));
    await disconnected;

    expect(logout.status).toBe(200);
    await waitForCondition("Alice to become offline after logout", async () => {
      return !(await isUserOnline(alice.user.id));
    });
  });

  it("rejects a socket without a valid access token", async () => {
    const errorMessage = await new Promise<string>((resolve) => {
      const client = io(serverUrl, {
        auth: { token: "invalid-access-token" },
        transports: ["websocket"],
        reconnection: false,
      });
      client.once("connect_error", (error: Error) => {
        client.close();
        resolve(error.message);
      });
    });
    expect(errorMessage).toBe("Socket authentication failed");
  });
});
