import { createHmac } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { env } from "../src/config/env.js";
import { AppError } from "../src/core/errors.js";
import {
  sendTextMessageThroughMessageServer,
} from "../src/sockets/message-bridge.js";

const secret = "message-bridge-test-secret-that-is-longer-than-32-characters";
const servers: HttpServer[] = [];

afterEach(async () => {
  env.MESSAGE_SERVICE_URL = undefined;
  env.INTERNAL_SERVICE_SECRET = undefined;
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          if (!server.listening) {
            resolve();
            return;
          }
          server.close(() => resolve());
        }),
    ),
  );
});

describe("legacy Socket.IO message bridge", () => {
  it("forwards the user token and internal authentication without changing the result", async () => {
    let body = "";
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        body = Buffer.concat(chunks).toString("utf8");
        expect(request.headers.authorization).toBe("Bearer user-access-token");
        expect(request.headers["x-internal-service-token"]).toBe(
          createHmac("sha256", secret)
            .update("terqivo-message-server")
            .digest("hex"),
        );
        response.writeHead(201, { "content-type": "application/json" });
        response.end(JSON.stringify({
          success: true,
          data: {
            message: { id: "message-1" },
            duplicate: false,
            recipientId: "recipient-1",
          },
        }));
      });
    });
    await listen(server);
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("bridge test server unavailable");
    servers.push(server);
    env.MESSAGE_SERVICE_URL = `http://127.0.0.1:${address.port}`;
    env.INTERNAL_SERVICE_SECRET = secret;

    const result = await sendTextMessageThroughMessageServer(
      { userId: "sender-1", sessionId: "session-1" },
      "user-access-token",
      "conversation-1",
      { clientMessageId: "client-1", type: "text", text: "opaque test body" },
    );

    expect(result.message.id).toBe("message-1");
    expect(result.recipientId).toBe("recipient-1");
    expect(JSON.parse(body)).toMatchObject({
      conversationId: "conversation-1",
      clientMessageId: "client-1",
      userId: "sender-1",
    });
  });

  it("returns a safe controlled error when the Message Server is unavailable", async () => {
    env.MESSAGE_SERVICE_URL = "http://127.0.0.1:1";
    env.INTERNAL_SERVICE_SECRET = secret;

    const result = sendTextMessageThroughMessageServer(
      { userId: "sender-1", sessionId: "session-1" },
      "user-access-token",
      "conversation-1",
      { clientMessageId: "client-2", type: "text", text: "opaque test body" },
    );

    await expect(result).rejects.toBeInstanceOf(AppError);
    await expect(result).rejects.toMatchObject({
      code: "MESSAGE_SERVICE_UNAVAILABLE",
      statusCode: 503,
    });
  });
});

function listen(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}
