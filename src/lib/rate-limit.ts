type RateEntry = { startedAt: number; requests: number };

const aiRateWindows = new Map<string, RateEntry>();
const AI_RATE_WINDOW_MS = 60_000;
const AI_RATE_LIMIT = 20;

/** Lightweight per-process protection; production should also use a shared gateway limit. */
export function admitAiRequest(
  request?: Request,
  nodeEnv = process.env.NODE_ENV,
) {
  if (nodeEnv !== "production") return true;
  const forwarded = request?.headers.get("x-forwarded-for")?.split(",")[0];
  const key =
    forwarded?.trim() || request?.headers.get("x-real-ip") || "unknown";
  const now = Date.now();
  for (const [entryKey, entry] of aiRateWindows) {
    if (now - entry.startedAt > AI_RATE_WINDOW_MS)
      aiRateWindows.delete(entryKey);
  }
  const entry = aiRateWindows.get(key);
  if (!entry || now - entry.startedAt > AI_RATE_WINDOW_MS) {
    aiRateWindows.set(key, { startedAt: now, requests: 1 });
    return true;
  }
  entry.requests += 1;
  return entry.requests <= AI_RATE_LIMIT;
}
