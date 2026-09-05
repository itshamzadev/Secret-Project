import { logger } from "../../lib/logger.js";
import { redisClient } from "../../lib/redis.js";

interface LocalCacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class KnowledgeSearchCache<T> {
  private readonly localCache = new Map<string, LocalCacheEntry<T>>();

  public constructor(private readonly ttlSeconds: number) {}

  public async get(key: string): Promise<T | null> {
    if (redisClient.isReady) {
      try {
        const cached = await redisClient.get(key);
        if (cached !== null) return JSON.parse(cached) as T;
      } catch (error: unknown) {
        logger.warn({ err: error }, "Knowledge search Redis read failed");
      }
    }
    const entry = this.localCache.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAt <= Date.now()) {
      this.localCache.delete(key);
      return null;
    }
    return entry.value;
  }

  public async set(key: string, value: T): Promise<void> {
    this.localCache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlSeconds * 1_000,
    });
    if (!redisClient.isReady) return;
    try {
      await redisClient.set(key, JSON.stringify(value), {
        EX: this.ttlSeconds,
      });
    } catch (error: unknown) {
      logger.warn({ err: error }, "Knowledge search Redis write failed");
    }
  }
}
