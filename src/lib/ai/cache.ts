export class AsyncTtlCache {
  private values = new Map<
    string,
    { expires: number; value: Promise<unknown> }
  >();
  constructor(private readonly maxEntries = 250) {}
  async getOrCreate<T>(
    key: string,
    ttlMs: number,
    action: () => Promise<T>,
  ): Promise<T> {
    const found = this.values.get(key);
    if (found && found.expires > Date.now()) return found.value as Promise<T>;
    if (this.values.size >= this.maxEntries)
      this.values.delete(this.values.keys().next().value!);
    const value = action();
    this.values.set(key, { expires: Date.now() + ttlMs, value });
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
