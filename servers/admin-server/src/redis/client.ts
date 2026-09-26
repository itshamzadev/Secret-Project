import { createClient } from "redis";

import type { AdminServerConfig } from "../config/env.js";

export function createAdminRedisClient(config: AdminServerConfig) {
  const client = createClient({ url: config.REDIS_URL });
  client.on("error", () => undefined);
  return client;
}

export function getRedisStatus(client: ReturnType<typeof createAdminRedisClient>): "connected" | "disconnected" {
  return client.isReady ? "connected" : "disconnected";
}
