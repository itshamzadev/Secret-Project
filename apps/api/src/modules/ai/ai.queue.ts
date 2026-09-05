export class PerConversationAiQueue {
  private readonly tails = new Map<string, Promise<void>>();

  public run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    const tail = current.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    return current.finally(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
  }

  public size(): number {
    return this.tails.size;
  }
}
