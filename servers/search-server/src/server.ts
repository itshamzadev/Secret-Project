import { createServer } from "node:http";
import { createClient } from "redis";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { KnowledgeSearchCache } from "./modules/search/search.cache.js";
import { createWebSearchProvider } from "./modules/search/search.provider.js";
import { SearchService } from "./modules/search/search.service.js";
import { searchRules } from "./modules/search/search.rules.js";

let redis: ReturnType<typeof createClient> | undefined;
if (env.REDIS_URL !== undefined) { redis = createClient({ url: env.REDIS_URL }); redis.on("error", () => undefined); void redis.connect().catch(() => undefined); }
const searchService = new SearchService(createWebSearchProvider(), new KnowledgeSearchCache(searchRules.cacheTtlSeconds, redis));
const app = createApp({ searchService });
const server = createServer(app);
server.listen(env.PORT, () => { process.stdout.write(`search-server listening on ${env.PORT}\n`); });
let shuttingDown = false;
async function shutdown(): Promise<void> { if (shuttingDown) return; shuttingDown = true; server.close(); if (redis?.isOpen === true) await redis.quit().catch(() => undefined); process.exit(0); }
process.once("SIGTERM", () => void shutdown()); process.once("SIGINT", () => void shutdown());
