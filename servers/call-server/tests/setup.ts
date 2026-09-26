process.env.NODE_ENV = "test";
process.env.SERVICE_NAME = "call-server-test";
process.env.SERVICE_VERSION = "0.1.0-test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/terqivo-call-test";
process.env.REDIS_URL = "redis://127.0.0.1:6379";
process.env.JWT_ACCESS_SECRET = "call-server-test-access-secret-0123456789";
process.env.JWT_ISSUER = "terqivo-connect";
process.env.JWT_AUDIENCE = "terqivo-clients";
process.env.INTERNAL_SERVICE_SECRET = "call-server-test-internal-secret-0123456789";
process.env.RELATIONSHIP_SERVICE_URL = "http://127.0.0.1:1";
process.env.WEB_ORIGIN = "http://localhost:3000";
const { RedisMemoryServer } = await import("redis-memory-server");
const redisServer = await RedisMemoryServer.create({ instance: { port: 0 } });
process.env.REDIS_URL = `redis://${await redisServer.getHost()}:${await redisServer.getPort()}`;

const { createServer } = await import("node:http");
let relationshipBlocked = false;
export function setRelationshipBlocked(value: boolean): void { relationshipBlocked = value; }
const relationshipServer = createServer((_request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ success: true, data: { blocked: relationshipBlocked, areContacts: false } }));
});
await new Promise<void>((resolve, reject) => { relationshipServer.once("error", reject); relationshipServer.listen(0, "127.0.0.1", () => { relationshipServer.removeListener("error", reject); resolve(); }); });
const relationshipAddress = relationshipServer.address();
if (relationshipAddress === null || typeof relationshipAddress === "string") throw new Error("relationship mock did not expose a port");
process.env.RELATIONSHIP_SERVICE_URL = `http://127.0.0.1:${relationshipAddress.port}`;

import { afterAll } from "vitest";
afterAll(async () => {
  await redisServer.stop();
  await new Promise<void>((resolve) => relationshipServer.close(() => resolve()));
});
