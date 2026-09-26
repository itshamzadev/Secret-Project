import { logger } from "../../logging/logger.js";

interface Entry<T> { value: T; expiresAt: number; }
export interface RedisCacheClient { readonly isReady: boolean; get(key: string): Promise<string | null>; set(key: string, value: string, options: { EX: number }): Promise<unknown>; }

export class KnowledgeSearchCache<T> {
  private readonly local = new Map<string, Entry<T>>();
  public constructor(private readonly ttlSeconds: number, private readonly redis?: RedisCacheClient) {}
  public async get(key: string): Promise<T | null> {
    if (this.redis?.isReady === true) {
      try { const value = await this.redis.get(key); if (value !== null) return JSON.parse(value) as T; } catch (error) { logger.warn({ err: error }, "Knowledge search Redis read failed"); }
    }
    const entry = this.local.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAt <= Date.now()) { this.local.delete(key); return null; }
    return entry.value;
  }
  public async set(key: string, value: T): Promise<void> {
    this.local.set(key, { value, expiresAt: Date.now() + this.ttlSeconds * 1000 });
    if (this.redis?.isReady !== true) return;
    try { await this.redis.set(key, JSON.stringify(value), { EX: this.ttlSeconds }); } catch (error) { logger.warn({ err: error }, "Knowledge search Redis write failed"); }
  }
}
