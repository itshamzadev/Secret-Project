import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll } from "vitest";
import { startRelationshipMock, stopRelationshipMock } from "./relationship-mock.js";
import { RedisMemoryServer } from "redis-memory-server";

process.env.NODE_ENV ??= "test";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/terqivo_message_test";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-32-characters";
process.env.WEB_ORIGIN ??= "http://localhost:3000";
process.env.MEDIA_STORAGE_PATH ??= join(tmpdir(), "terqivo-message-server-media-test");
process.env.E2EFE_ENFORCEMENT_ENABLED ??= "true";
process.env.INTERNAL_SERVICE_SECRET ??= "message-server-test-internal-secret-0123456789";

const redisServer = new RedisMemoryServer();
const [redisHost, redisPort] = await Promise.all([
  redisServer.getHost(),
  redisServer.getPort(),
]);
process.env.REDIS_URL ??= `redis://${redisHost}:${redisPort}`;
await startRelationshipMock();

afterAll(async () => {
  await stopRelationshipMock();
  await redisServer.stop();
});
