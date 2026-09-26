import { createServer, type Server as HttpServer } from "node:http";

import { Server as SocketIOServer } from "socket.io";
import { io as createSocketClient, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

import { createGatewayConfig } from "../src/config.js";
import { createGatewayServer, type GatewayServer } from "../src/server.js";

interface TestUpstream {
  readonly server: HttpServer;
  readonly baseUrl: string;
  readonly getCapturedRequest: () => {
    headers: Record<string, string | string[] | undefined>;
    body: Buffer;
  } | undefined;
  readonly close: () => Promise<void>;
}

const activeClosers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (activeClosers.length > 0) {
    await activeClosers.pop()?.();
  }
});

describe("gateway HTTP compatibility layer", () => {
  it("serves gateway-owned health and readiness without a monolith", async () => {
    const upstream = await createTestUpstream();
    const gateway = await createTestGateway(upstream.baseUrl);

    const health = await fetch(`${gateway.baseUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      success: true,
      data: { serviceName: "gateway", status: "ok" },
    });

    const ready = await fetch(`${gateway.baseUrl}/ready`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({
      success: true,
      data: { status: "ready" },
    });
    const apiHealth = await fetch(`${gateway.baseUrl}/api/v1/health`);
    expect(apiHealth.status).toBe(200);
  });

  it("preserves method, query, authorization, correlation IDs, status, body, content type, and cookies", async () => {
    const upstream = await createTestUpstream();
    const gateway = await createTestGateway(upstream.baseUrl);
    const response = await fetch(
      `${gateway.baseUrl}/api/v1/messages/probe?cursor=one&cursor=two`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          Origin: "https://client.example",
          "Content-Type": "application/json",
          "X-Request-ID": "req-test-123",
          "X-Correlation-ID": "corr-test-456",
        },
        body: JSON.stringify({ encrypted: true }),
      },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("set-cookie")).toContain("session=opaque");
    expect(response.headers.get("x-request-id")).toBe("req-test-123");
    expect(response.headers.get("x-correlation-id")).toBe("corr-test-456");
    expect(await response.text()).toBe("opaque-upstream-response");

    const captured = upstream.getCapturedRequest();
    expect(captured?.headers.authorization).toBe("Bearer test-token");
    expect(captured?.headers.origin).toBe("https://client.example");
    expect(captured?.headers["x-request-id"]).toBe("req-test-123");
    expect(captured?.headers["x-correlation-id"]).toBe("corr-test-456");
    expect(captured?.body.toString("utf8")).toBe('{"encrypted":true}');
  });

  it("routes auth paths to Auth Server and message paths to Message Server", async () => {
    const upstream = await createTestUpstream();
    const auth = await createTestUpstream();
    const gateway = await createTestGateway(upstream.baseUrl, {
      authServiceUrl: auth.baseUrl,
    });

    const authResponse = await fetch(`${gateway.baseUrl}/api/v1/auth/probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ route: "auth" }),
    });
    expect(authResponse.status).toBe(201);
    expect(auth.getCapturedRequest()?.body.toString("utf8")).toBe(
      '{"route":"auth"}',
    );
    expect(upstream.getCapturedRequest()).toBeUndefined();

    const profileResponse = await fetch(
      `${gateway.baseUrl}/api/v1/users/me/profile`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Profile" }),
      },
    );
    expect(profileResponse.status).toBe(201);
    expect(auth.getCapturedRequest()?.body.toString("utf8")).toBe(
      '{"displayName":"Profile"}',
    );

    const messageResponse = await fetch(
      `${gateway.baseUrl}/api/v1/messages/probe`,
    );
    expect(messageResponse.status).toBe(201);
    expect(upstream.getCapturedRequest()).toBeDefined();
  });

  it("routes Search and AI paths to Search Server while keeping messages on Message Server", async () => {
    const upstream = await createTestUpstream();
    const search = await createTestUpstream();
    const message = await createTestUpstream();
    const gateway = await createTestGateway(upstream.baseUrl, {
      searchServiceUrl: search.baseUrl,
      messageServiceUrl: message.baseUrl,
    });
    const searchResponse = await fetch(`${gateway.baseUrl}/api/v1/search/web?q=terqivo`);
    expect(searchResponse.status).toBe(201);
    expect(search.getCapturedRequest()).toBeDefined();
    expect(upstream.getCapturedRequest()).toBeUndefined();
    const aiResponse = await fetch(`${gateway.baseUrl}/api/v1/ai/models`);
    expect(aiResponse.status).toBe(201);
    expect(search.getCapturedRequest()).toBeDefined();
    const messageResponse = await fetch(`${gateway.baseUrl}/api/v1/messages/probe`);
    expect(messageResponse.status).toBe(201);
    expect(message.getCapturedRequest()).toBeDefined();
  });

  it("routes admin and report paths to Admin Server and status to Status Server", async () => {
    const upstream = await createTestUpstream();
    const admin = await createTestUpstream();
    const status = await createTestUpstream();
    const gateway = await createTestGateway(upstream.baseUrl, { adminServiceUrl: admin.baseUrl, statusServiceUrl: status.baseUrl });
    const adminResponse = await fetch(`${gateway.baseUrl}/api/v1/admin/dashboard`, { headers: { Authorization: "Bearer admin-token" } });
    expect(adminResponse.status).toBe(201);
    expect(admin.getCapturedRequest()).toBeDefined();
    expect(upstream.getCapturedRequest()).toBeUndefined();
    const reportResponse = await fetch(`${gateway.baseUrl}/api/v1/reports`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
    expect(reportResponse.status).toBe(201);
    expect(admin.getCapturedRequest()).toBeDefined();
    const statusResponse = await fetch(`${gateway.baseUrl}/api/v1/status`);
    expect(statusResponse.status).toBe(201);
    expect(status.getCapturedRequest()).toBeDefined();
    expect(upstream.getCapturedRequest()).toBeUndefined();
  });

  it("routes contacts and block policy to Relationship Server while keeping privacy with Auth Server", async () => {
    const upstream = await createTestUpstream();
    const auth = await createTestUpstream();
    const relationship = await createTestUpstream();
    const gateway = await createTestGateway(upstream.baseUrl, {
      authServiceUrl: auth.baseUrl,
      relationshipServiceUrl: relationship.baseUrl,
    });

    const contacts = await fetch(`${gateway.baseUrl}/api/v1/contacts?limit=20`, { headers: { Authorization: "Bearer opaque" } });
    expect(contacts.status).toBe(201);
    expect(relationship.getCapturedRequest()).toBeDefined();
    expect(upstream.getCapturedRequest()).toBeUndefined();

    const blocked = await fetch(`${gateway.baseUrl}/api/v1/users/507f1f77bcf86cd799439011/block`, { method: "PUT", headers: { Authorization: "Bearer opaque" } });
    expect(blocked.status).toBe(201);
    expect(relationship.getCapturedRequest()).toBeDefined();

    const privacy = await fetch(`${gateway.baseUrl}/api/v1/users/me/privacy`, { headers: { Authorization: "Bearer opaque" } });
    expect(privacy.status).toBe(201);
    expect(auth.getCapturedRequest()).toBeDefined();
  });

  it("routes message and community APIs, including avatars, to Message Server", async () => {
    const upstream = await createTestUpstream();
    const message = await createTestUpstream();
    const gateway = await createTestGateway(upstream.baseUrl, {
      messageServiceUrl: message.baseUrl,
    });

    const messageResponse = await fetch(`${gateway.baseUrl}/api/v1/messages/probe`);
    expect(messageResponse.status).toBe(201);
    expect(message.getCapturedRequest()).toBeDefined();
    expect(upstream.getCapturedRequest()).toBeUndefined();

    const avatarResponse = await fetch(`${gateway.baseUrl}/api/v1/groups/abc/avatar`);
    expect(avatarResponse.status).toBe(201);
    expect(message.getCapturedRequest()).toBeDefined();
  });

  it("routes call REST traffic to Call Server without changing the public path", async () => {
    const upstream = await createTestUpstream();
    const calls = await createTestUpstream();
    const gateway = await createTestGateway(upstream.baseUrl, { callServiceUrl: calls.baseUrl });
    const response = await fetch(`${gateway.baseUrl}/api/v1/calls?limit=20`, { headers: { Authorization: "Bearer opaque" } });
    expect(response.status).toBe(201);
    expect(calls.getCapturedRequest()).toBeDefined();
    expect(upstream.getCapturedRequest()).toBeUndefined();
  });

  it("routes media downloads and conversation uploads to Media Server", async () => {
    const upstream = await createTestUpstream();
    const media = await createTestUpstream();
    const gateway = await createTestGateway(upstream.baseUrl, { mediaServiceUrl: media.baseUrl });
    const download = await fetch(`${gateway.baseUrl}/api/v1/media/file.bin`, { headers: { Authorization: "Bearer opaque" } });
    expect(download.status).toBe(201);
    expect(media.getCapturedRequest()).toBeDefined();
    expect(upstream.getCapturedRequest()).toBeUndefined();
    const upload = await fetch(`${gateway.baseUrl}/api/v1/conversations/abc/media`, { method: "POST", body: Buffer.from([1, 2, 3]), headers: { Authorization: "Bearer opaque", "Content-Type": "application/octet-stream" } });
    expect(upload.status).toBe(201);
    expect(media.getCapturedRequest()).toBeDefined();
  });

  it("routes notification APIs to Notification Server", async () => {
    const upstream = await createTestUpstream();
    const notifications = await createTestUpstream();
    const gateway = await createTestGateway(upstream.baseUrl, { notificationServiceUrl: notifications.baseUrl });
    const response = await fetch(`${gateway.baseUrl}/api/v1/notifications/devices`, { method: "POST", body: JSON.stringify({ pushToken: "opaque" }), headers: { "Content-Type": "application/json", Authorization: "Bearer opaque" } });
    expect(response.status).toBe(201);
    expect(notifications.getCapturedRequest()).toBeDefined();
    expect(upstream.getCapturedRequest()).toBeUndefined();
  });

  it("replaces invalid request IDs and keeps binary request bytes unchanged", async () => {
    const upstream = await createTestUpstream();
    const gateway = await createTestGateway(upstream.baseUrl);
    const bytes = Buffer.from([0, 1, 2, 255, 10, 13]);
    const response = await fetch(`${gateway.baseUrl}/api/v1/media/binary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Request-ID": "contains whitespace",
      },
      body: bytes,
    });

    expect(response.status).toBe(202);
    expect(response.headers.get("x-request-id")).toMatch(/^[A-Za-z0-9-]{20,}$/);
    expect(response.headers.get("x-correlation-id")).toBe(
      response.headers.get("x-request-id"),
    );
    expect(upstream.getCapturedRequest()?.body.equals(bytes)).toBe(true);
  });

  it("rejects unmapped paths without exposing an upstream URL", async () => {
    const upstream = await createTestUpstream();
    const gateway = await createTestGateway(upstream.baseUrl);
    const response = await fetch(`${gateway.baseUrl}/proxy?url=http://secret.invalid`);
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toContain("GATEWAY_ROUTE_NOT_FOUND");
    expect(body).not.toContain(upstream.baseUrl);
    expect(body).not.toContain("secret.invalid");
  });

  it("returns controlled errors for an unavailable or timing-out upstream", async () => {
    const unavailable = await createTestGateway("http://127.0.0.1:1", { messageServiceUrl: "http://127.0.0.1:1" });
    const unavailableResponse = await fetch(
      `${unavailable.baseUrl}/api/v1/messages/health`,
    );
    expect(unavailableResponse.status).toBe(502);
    expect(await unavailableResponse.text()).not.toContain("127.0.0.1");

    const upstream = await createTestUpstream({ holdSlowRequests: true });
    const timeoutGateway = await createTestGateway(upstream.baseUrl, {
      upstreamRequestTimeoutMs: 50,
    });
    const timeoutResponse = await fetch(
      `${timeoutGateway.baseUrl}/api/v1/messages/slow`,
    );
    expect(timeoutResponse.status).toBe(504);
    expect(await timeoutResponse.text()).not.toContain(upstream.baseUrl);
  });

  it("keeps readiness independent from individual upstream services", async () => {
    const gateway = await createTestGateway("http://127.0.0.1:1");
    const response = await fetch(`${gateway.baseUrl}/ready`);
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("127.0.0.1");
  });
});

describe("gateway Socket.IO compatibility layer", () => {
  it.each(["polling", "websocket"] as const)(
    "proxies %s transport without changing event payloads",
    async (transport) => {
      const upstreamHttp = createServer();
      const upstreamIo = new SocketIOServer(upstreamHttp, {
        path: "/socket.io",
        transports: ["polling", "websocket"],
      });
      upstreamIo.on("connection", (socket) => {
        socket.on("client-event", (payload: unknown) => {
          socket.emit("server-event", payload);
        });
      });
      await listen(upstreamHttp);
      const upstreamAddress = upstreamHttp.address();
      if (upstreamAddress === null || typeof upstreamAddress === "string") {
        throw new Error("Upstream test server did not expose a port");
      }
      const gateway = await createTestGateway(
        `http://127.0.0.1:${upstreamAddress.port}`,
        { realtimeHubUrl: `http://127.0.0.1:${upstreamAddress.port}` },
      );
      const gatewayAddress = gateway.server.address();
      if (gatewayAddress === null || typeof gatewayAddress === "string") {
        throw new Error("Gateway test server did not expose a port");
      }

      activeClosers.push(async () => {
        await new Promise<void>((resolve) => {
          upstreamIo.close(() => resolve());
        });
        await closeServer(upstreamHttp);
      });

      const socket = createSocketClient(`http://127.0.0.1:${gatewayAddress.port}`, {
        path: "/socket.io",
        transports: [transport],
        timeout: 2_000,
      });
      await waitForSocket(socket, "connect");
      const event = waitForSocketEvent(socket, "server-event");
      socket.emit("client-event", { encryptedEnvelope: "opaque" });
      await expect(event).resolves.toEqual({ encryptedEnvelope: "opaque" });
      socket.close();
    },
    10_000,
  );
});

async function createTestGateway(
  upstreamUrl: string,
  overrides: Partial<Parameters<typeof createGatewayConfig>[0]> = {},
): Promise<GatewayServer & { baseUrl: string }> {
  const gateway = createGatewayServer(
    createGatewayConfig({
      nodeEnv: "test",
      port: 0,
      authServiceUrl: upstreamUrl,
      messageServiceUrl: upstreamUrl,
      realtimeHubUrl: upstreamUrl,
      callServiceUrl: upstreamUrl,
      mediaServiceUrl: upstreamUrl,
      notificationServiceUrl: upstreamUrl,
      relationshipServiceUrl: upstreamUrl,
      statusServiceUrl: upstreamUrl,
      searchServiceUrl: upstreamUrl,
      adminServiceUrl: upstreamUrl,
      logLevel: "silent",
      ...overrides,
    }),
  );
  await listen(gateway.server);
  const address = gateway.server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Gateway test server did not expose a port");
  }
  const result = { ...gateway, baseUrl: `http://127.0.0.1:${address.port}` };
  activeClosers.push(result.close);
  return result;
}

async function createTestUpstream(options: { holdSlowRequests?: boolean } = {}): Promise<TestUpstream> {
  let capturedRequest:
    | { headers: Record<string, string | string[] | undefined>; body: Buffer }
    | undefined;
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/api/v1/health")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ success: true }));
      return;
    }
    if (options.holdSlowRequests && request.url?.includes("/slow")) return;

    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      capturedRequest = { headers: request.headers, body: Buffer.concat(chunks) };
      if (request.url?.includes("/binary")) {
        response.writeHead(202, { "Content-Type": "application/octet-stream" });
        response.end("accepted");
        return;
      }
      response.writeHead(201, {
        "Content-Type": "text/plain; charset=utf-8",
        "Set-Cookie": "session=opaque; HttpOnly",
      });
      response.end("opaque-upstream-response");
    });
  });
  await listen(server);
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Upstream test server did not expose a port");
  }
  const result: TestUpstream = {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    getCapturedRequest: () => capturedRequest,
    close: () => closeServer(server),
  };
  activeClosers.push(result.close);
  return result;
}

function listen(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}

function closeServer(server: HttpServer): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function waitForSocket(socket: Socket, eventName: "connect"): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once(eventName, () => resolve());
    socket.once("connect_error", reject);
  });
}

function waitForSocketEvent(socket: Socket, eventName: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Socket event timed out")), 2_000);
    socket.once(eventName, (payload: unknown) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}
