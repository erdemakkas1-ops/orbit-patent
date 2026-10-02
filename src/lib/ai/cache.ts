export class AsyncTtlCache {
  private values = new Map<
    string,
    { expires: number; value: Promise<unknown> }
  >();
  constructor(private readonly maxEntries = 250) {}
  get<T>(key: string): Promise<T> | undefined {
    const found = this.values.get(key);
    if (!found) return undefined;
    if (found.expires <= Date.now()) {
      this.values.delete(key);
      return undefined;
    }
    return found.value as Promise<T>;
  }
  set<T>(key: string, ttlMs: number, value: T | Promise<T>) {
    if (this.values.size >= this.maxEntries)
      this.values.delete(this.values.keys().next().value!);
    this.values.set(key, {
      expires: Date.now() + ttlMs,
      value: Promise.resolve(value),
    });
  }
  async getOrCreate<T>(
    key: string,
    ttlMs: number,
    action: () => Promise<T>,
  ): Promise<T> {
    const found = this.get<T>(key);
    if (found) return found;
    const value = action();
    this.set(key, ttlMs, value);
    try {
      return await value;
    } catch (error) {
      this.values.delete(key);
      throw error;
    }
  }
  clear() {
    this.values.clear();
  }
}
export const allowsMockFallback = (environment: string | undefined) =>
  environment !== "production";
