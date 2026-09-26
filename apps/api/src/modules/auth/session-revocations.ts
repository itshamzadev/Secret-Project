import { disconnectSessionSockets } from "../../sockets/session-registry.js";
import { redisClient } from "../../lib/redis.js";
import { logger } from "../../lib/logger.js";

const sessionRevocationChannel = "terqivo:auth:session-revoked:v1";
let subscriber: ReturnType<typeof redisClient.duplicate> | undefined;

export async function startSessionRevocationSubscriber(): Promise<void> {
  if (subscriber !== undefined || !redisClient.isReady) return;

  subscriber = redisClient.duplicate();
  subscriber.on("error", (error: Error) => {
    logger.error({ err: error }, "Auth session revocation subscriber error");
  });
  await subscriber.connect();
  await subscriber.subscribe(sessionRevocationChannel, (sessionId) => {
    disconnectSessionSockets(sessionId);
  });
}

export async function stopSessionRevocationSubscriber(): Promise<void> {
  if (subscriber === undefined) return;
  await subscriber.unsubscribe(sessionRevocationChannel).catch(() => undefined);
  if (subscriber.isOpen) await subscriber.quit();
  subscriber = undefined;
}
