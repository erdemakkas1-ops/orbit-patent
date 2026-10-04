import { createHash } from "node:crypto";
import { durableIncrement } from "@/lib/durable-cache";

type RateEntry = { startedAt: number; requests: number };

const aiRateWindows = new Map<string, RateEntry>();
const AI_RATE_WINDOW_MS = 60_000;
const AI_RATE_LIMIT = 20;

function clientKey(request?: Request) {
  const forwarded = request?.headers.get("x-forwarded-for")?.split(",")[0];
  return forwarded?.trim() || request?.headers.get("x-real-ip") || "unknown";
}

/** Per-instance burst guard; `admitSharedAiRequest` enforces it across instances. */
export function admitAiRequest(
  request?: Request,
  nodeEnv = process.env.NODE_ENV,
) {
  if (nodeEnv !== "production") return true;
  const key = clientKey(request);
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

/**
 * The same per-client limit counted in the shared store, so it holds however
 * many serverless instances are running. Only a hash of the IP is stored, for
 * at most two minutes. Without the shared store it admits and the
 * per-instance guard is all that applies.
 */
export async function admitSharedAiRequest(
  request?: Request,
  nodeEnv = process.env.NODE_ENV,
  now = Date.now(),
) {
  if (nodeEnv !== "production") return true;
  const client = createHash("sha256")
    .update(clientKey(request))
    .digest("hex")
    .slice(0, 24);
  const minute = Math.floor(now / AI_RATE_WINDOW_MS);
  const used = await durableIncrement(`rate:ai:${client}:${minute}`, 120);
  return used === undefined || used <= AI_RATE_LIMIT;
}
