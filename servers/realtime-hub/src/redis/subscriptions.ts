import { logger } from "../logging/logger.js";
import type { RedisRuntime } from "./client.js";

export const MESSAGE_EVENT_CHANNEL = "terqivo:message-events:v1";
export const SESSION_REVOKED_CHANNEL = "terqivo:auth:session-revoked:v1";
export const CALL_EVENT_CHANNEL = "terqivo:call-events:v1";

type EventConsumer = (raw: string) => void | Promise<void>;

export async function subscribeChannel(
  redis: RedisRuntime,
  channel: string,
  consumer: EventConsumer,
): Promise<() => Promise<void>> {
  const subscriber = redis.command.duplicate();
  subscriber.on("error", (error: Error) => logger.error({ err: error, channel }, "Realtime Redis subscription error"));
  await subscriber.connect();
  await subscriber.subscribe(channel, (raw) => {
    void Promise.resolve(consumer(raw)).catch((error: unknown) => logger.error({ err: error, channel }, "Realtime Redis event handling failed"));
  });
  return async () => {
    await subscriber.unsubscribe(channel).catch(() => undefined);
    if (subscriber.isOpen) await subscriber.quit();
  };
}
