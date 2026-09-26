import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll } from "vitest";

process.env.NODE_ENV = "test";
process.env.SERVICE_NAME = "media-server-test";
process.env.SERVICE_VERSION = "0.1.0-test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/terqivo-media-test";
process.env.JWT_ACCESS_SECRET = "media-server-test-access-secret-0123456789";
process.env.JWT_ISSUER = "terqivo-connect";
process.env.JWT_AUDIENCE = "terqivo-clients";
process.env.INTERNAL_SERVICE_SECRET = "media-server-test-internal-secret-0123456789";
process.env.INTERNAL_SERVICE_ISSUER = "terqivo-internal";
process.env.INTERNAL_SERVICE_AUDIENCE = "terqivo-services";
process.env.MEDIA_STORAGE_DRIVER = "local";
process.env.MEDIA_STORAGE_PATH = await mkdtemp(join(tmpdir(), "terqivo-media-server-test-"));
process.env.WEB_ORIGIN = "http://localhost:3000";

const mockMessageServer = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const body = chunks.length === 0 ? null : JSON.parse(Buffer.concat(chunks).toString("utf8")) as { storageKey?: string; size?: number; media?: { storageKey?: string; mimeType?: string; size?: number; fileName?: string | null } };
  const storageKey = body?.media?.storageKey ?? "mock.bin";
  const media = {
    url: `/api/v1/media/${storageKey}`,
    storageKey,
    mimeType: body?.media?.mimeType ?? "application/octet-stream",
    size: body?.media?.size ?? 0,
    width: null,
    height: null,
    durationSeconds: null,
    thumbnailUrl: null,
    fileName: body?.media?.fileName ?? null,
  };
  response.setHeader("content-type", "application/json");
  if (request.url === "/internal/media/authorize-download") {
    response.end(JSON.stringify({ success: true, data: media }));
    return;
  }
  if (request.url === "/internal/media/stage") {
    response.statusCode = 201;
    response.end(JSON.stringify({ success: true, data: { storageKey: body?.storageKey ?? "mock.bin", size: body?.size ?? 0, duplicate: false } }));
    return;
  }
  response.statusCode = request.url === "/internal/media/send" ? 201 : 200;
  response.end(JSON.stringify({ success: true, data: { message: { id: "mock-message", media }, duplicate: false } }));
});
await new Promise<void>((resolve) => mockMessageServer.listen(0, "127.0.0.1", resolve));
const address = mockMessageServer.address();
if (address === null || typeof address === "string") throw new Error("Mock message server did not bind.");
process.env.MESSAGE_SERVICE_URL = `http://127.0.0.1:${address.port}`;

afterAll(async () => {
  await new Promise<void>((resolve, reject) => mockMessageServer.close((error) => error ? reject(error) : resolve()));
  await rm(process.env.MEDIA_STORAGE_PATH as string, { recursive: true, force: true });
});
