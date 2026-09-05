export interface AiCacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class AiResponseCache<T> {
  private readonly entries = new Map<string, AiCacheEntry<T>>();

  public constructor(private readonly ttlMs = 5 * 60_000) {}

  public get(key: string): T | null {
    const entry = this.entries.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  public set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  public clear(): void {
    this.entries.clear();
  }
}
