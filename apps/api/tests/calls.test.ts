import { createServer, type Server as HttpServer } from "node:http";

import { io, type Socket } from "socket.io-client";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { createApp } from "../src/app.js";
import { connectRedis, disconnectRedis } from "../src/lib/redis.js";
import { CallModel } from "../src/modules/calls/call.model.js";
import { markCallMissed } from "../src/modules/calls/call.service.js";
import {
  createSocketServer,
  type SocketRuntime,
} from "../src/sockets/index.js";
import {
  authData,
  clearTestData,
  connectTestData,
  disconnectTestData,
  registerPayload,
} from "./test-helpers.js";

const app = createApp();
let httpServer: HttpServer;
let socketRuntime: SocketRuntime;
let serverUrl: string;
const clients: Socket[] = [];

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
      clients.push(client);
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
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      3_000,
    );
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
  return new Promise((resolve) =>
    socket.emit(event, payload, (response: unknown) => resolve(response)),
  );
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

beforeAll(async () => {
  await connectTestData();
  await connectRedis();
  httpServer = createServer(app);
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });
  const address = httpServer.address();
  if (address === null || typeof address === "string")
    throw new Error("Socket server address unavailable");
  serverUrl = `http://127.0.0.1:${address.port}`;
  socketRuntime = await createSocketServer(httpServer);
});

beforeEach(clearTestData);

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => closeClient(client)));
});

afterAll(async () => {
  await socketRuntime.close();
  if (httpServer.listening) {
    await new Promise<void>((resolve, reject) =>
      httpServer.close((error) =>
        error === undefined ? resolve() : reject(error),
      ),
    );
  }
  await disconnectTestData();
  await disconnectRedis();
});

describe("direct calls", () => {
  it("starts, accepts, ends, and exposes participant-only call history", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.Example",
        name: "Bob Example",
        phone: "+14155550102",
        email: "bob@example.com",
      }),
    );
    const aliceSocket = await connectClient(alice.accessToken);
    const bobSocket = await connectClient(bob.accessToken);
    const incomingPromise = waitForEvent(bobSocket, "call:incoming");
    const startAck = await emitWithAck(aliceSocket, "call:start", {
      calleeId: bob.user.id,
      type: "voice",
    });
    const started = startAck as {
      success: boolean;
      data: { call: { id: string; status: string } };
    };
    expect(started.success).toBe(true);
    expect(started.data.call.status).toBe("ringing");
    const incoming = (await incomingPromise) as {
      call: { id: string; type: string };
    };
    expect(incoming.call).toMatchObject({
      id: started.data.call.id,
      type: "voice",
    });

    const accepted = (await emitWithAck(bobSocket, "call:accept", {
      callId: started.data.call.id,
    })) as { success: boolean; data: { call: { status: string } } };
    expect(accepted).toMatchObject({
      success: true,
      data: { call: { status: "accepted" } },
    });
    const ended = (await emitWithAck(aliceSocket, "call:end", {
      callId: started.data.call.id,
    })) as { success: boolean; data: { call: { status: string } } };
    expect(ended).toMatchObject({
      success: true,
      data: { call: { status: "ended" } },
    });
    const duplicateEnd = (await emitWithAck(aliceSocket, "call:end", {
      callId: started.data.call.id,
    })) as { success: boolean; data: { changed: boolean } };
    expect(duplicateEnd).toMatchObject({
      success: true,
      data: { changed: false },
    });

    const history = await request(app)
      .get("/api/v1/calls")
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(history.status).toBe(200);
    expect(history.body.data.calls[0]).toMatchObject({
      type: "voice",
      direction: "outgoing",
      otherUser: { id: bob.user.id },
    });
    const stored = await CallModel.findById(started.data.call.id).exec();
    expect(stored?.status).toBe("ended");
    expect(stored).not.toHaveProperty("sdp");
    const bobHistory = await request(app)
      .get("/api/v1/calls")
      .set("Authorization", `Bearer ${bob.accessToken}`);
    expect(bobHistory.body.data.calls[0]).toMatchObject({
      direction: "incoming",
      otherUser: { id: alice.user.id },
    });
  });

  it("rejects self calls and prevents non-participants from modifying a call", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.Example",
        name: "Bob Example",
        phone: "+14155550102",
        email: "bob@example.com",
      }),
    );
    const eve = authData(
      await register({
        username: "Eve.Example",
        name: "Eve Example",
        phone: "+14155550103",
        email: "eve@example.com",
      }),
    );
    const aliceSocket = await connectClient(alice.accessToken);
    const eveSocket = await connectClient(eve.accessToken);
    const self = await emitWithAck(aliceSocket, "call:start", {
      calleeId: alice.user.id,
      type: "video",
    });
    expect(self).toMatchObject({
      success: false,
      error: { code: "CANNOT_CALL_SELF" },
    });
    const start = (await emitWithAck(aliceSocket, "call:start", {
      calleeId: bob.user.id,
      type: "video",
    })) as { data: { call: { id: string } } };
    const forbidden = await emitWithAck(eveSocket, "call:end", {
      callId: start.data.call.id,
    });
    expect(forbidden).toMatchObject({
      success: false,
      error: { code: "CALL_NOT_FOUND" },
    });
  });

  it("lets one of several callee devices answer while the others stop ringing", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.Example",
        name: "Bob Example",
        phone: "+14155550102",
        email: "bob@example.com",
      }),
    );
    const aliceSocket = await connectClient(alice.accessToken);
    const bobFirst = await connectClient(bob.accessToken);
    const bobSecond = await connectClient(bob.accessToken);
    const firstIncoming = waitForEvent(bobFirst, "call:incoming");
    const secondIncoming = waitForEvent(bobSecond, "call:incoming");
    const start = (await emitWithAck(aliceSocket, "call:start", {
      calleeId: bob.user.id,
      type: "voice",
    })) as { data: { call: { id: string } } };
    await Promise.all([firstIncoming, secondIncoming]);
    const elsewhere = waitForEvent(bobSecond, "call:answered-elsewhere");
    await emitWithAck(bobFirst, "call:accept", { callId: start.data.call.id });
    expect(await elsewhere).toMatchObject({
      callId: start.data.call.id,
      type: "voice",
    });
  });

  it("marks a ringing call missed through the authoritative state transition", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.Example",
        name: "Bob Example",
        phone: "+14155550102",
        email: "bob@example.com",
      }),
    );
    const aliceSocket = await connectClient(alice.accessToken);
    const start = (await emitWithAck(aliceSocket, "call:start", {
      calleeId: bob.user.id,
      type: "voice",
    })) as { data: { call: { id: string } } };
    const missed = await markCallMissed(start.data.call.id);
    expect(missed?.status).toBe("missed");
    expect(missed?.endReason).toBe("timeout");
  });

  it("supports decline, cancellation, and participant-only WebRTC signaling", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.Example",
        name: "Bob Example",
        phone: "+14155550102",
        email: "bob@example.com",
      }),
    );
    const eve = authData(
      await register({
        username: "Eve.Example",
        name: "Eve Example",
        phone: "+14155550103",
        email: "eve@example.com",
      }),
    );
    const aliceSocket = await connectClient(alice.accessToken);
    const bobSocket = await connectClient(bob.accessToken);
    const eveSocket = await connectClient(eve.accessToken);
    const first = (await emitWithAck(aliceSocket, "call:start", {
      calleeId: bob.user.id,
      type: "voice",
    })) as { data: { call: { id: string } } };
    const declined = await emitWithAck(bobSocket, "call:decline", {
      callId: first.data.call.id,
    });
    expect(declined).toMatchObject({
      success: true,
      data: { call: { status: "declined" } },
    });

    const second = (await emitWithAck(aliceSocket, "call:start", {
      calleeId: bob.user.id,
      type: "video",
    })) as { data: { call: { id: string } } };
    const cancelled = await emitWithAck(aliceSocket, "call:cancel", {
      callId: second.data.call.id,
    });
    expect(cancelled).toMatchObject({
      success: true,
      data: { call: { status: "cancelled" } },
    });

    const third = (await emitWithAck(aliceSocket, "call:start", {
      calleeId: bob.user.id,
      type: "video",
    })) as { data: { call: { id: string } } };
    await emitWithAck(bobSocket, "call:accept", { callId: third.data.call.id });
    const offerPromise = waitForEvent(bobSocket, "webrtc:offer");
    const validOffer = await emitWithAck(aliceSocket, "webrtc:offer", {
      callId: third.data.call.id,
      description: { type: "offer", sdp: "v=0\r\n" },
    });
    expect(validOffer).toMatchObject({
      success: true,
      data: { relayed: true },
    });
    expect(await offerPromise).toMatchObject({
      callId: third.data.call.id,
      description: { type: "offer" },
    });
    const invalidOffer = await emitWithAck(eveSocket, "webrtc:offer", {
      callId: third.data.call.id,
      description: { type: "offer", sdp: "v=0\r\n" },
    });
    expect(invalidOffer).toMatchObject({
      success: false,
      error: { code: "CALL_NOT_FOUND" },
    });
  });
});
