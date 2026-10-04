/**
 * Cross-instance cache on Upstash Redis (REST), shared by every serverless
 * instance. Without credentials every call is a no-op and callers fall back to
 * their in-memory caches, so local development and tests need no setup.
 * Vercel's Upstash integration sets KV_REST_API_*; a manual setup UPSTASH_*.
 */
const url =
  process.env.KV_REST_API_URL?.trim() ||
  process.env.UPSTASH_REDIS_REST_URL?.trim();
const token =
  process.env.KV_REST_API_TOKEN?.trim() ||
  process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
const PREFIX = "orbit:v1:";
// A slow cache must never slow the page more than recomputing would.
const TIMEOUT_MS = 1200;

export const durableCacheEnabled = Boolean(url && token);

async function command(args: (string | number)[]): Promise<unknown> {
  const response = await fetch(url!, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(args),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`DURABLE_CACHE_${response.status}`);
  return ((await response.json()) as { result?: unknown }).result;
}

/**
 * Atomically counts a hit. Callers put the time window in the key (minute,
 * day), so the expiry only cleans up and plain EXPIRE is enough. Returns the
 * new count, or undefined when the shared store is unavailable (callers then
 * fall back to their per-instance limits).
 */
export async function durableIncrement(
  key: string,
  ttlSeconds: number,
): Promise<number | undefined> {
  if (!durableCacheEnabled) return undefined;
  try {
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify([
        ["INCR", PREFIX + key],
        ["EXPIRE", PREFIX + key, ttlSeconds],
      ]),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    const [count] = (await response.json()) as { result?: unknown }[];
    return typeof count?.result === "number" ? count.result : undefined;
  } catch {
    return undefined;
  }
}

export async function durableGet<T>(key: string): Promise<T | undefined> {
  if (!durableCacheEnabled) return undefined;
  try {
    const raw = await command(["GET", PREFIX + key]);
    return typeof raw === "string" ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Await it: on serverless a write left running after the response can be
 * cut off when the instance is frozen, and the value is then never shared.
 * It never throws and is bounded by TIMEOUT_MS.
 */
export async function durableSet(key: string, value: unknown, ttlMs: number) {
  if (!durableCacheEnabled || value === undefined) return;
  try {
    await command([
      "SET",
      PREFIX + key,
      JSON.stringify(value),
      "EX",
      Math.max(1, Math.round(ttlMs / 1000)),
    ]);
  } catch {
    // Best effort: the value is still served from memory on this instance.
  }
}
