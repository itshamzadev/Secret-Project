import { createAdapter } from "@socket.io/redis-adapter";
import type { Server } from "socket.io";

import type { RedisRuntime } from "./client.js";

export function installRedisAdapter(io: Server, redis: RedisRuntime): void {
  io.adapter(createAdapter(redis.adapterPub, redis.adapterSub));
}
