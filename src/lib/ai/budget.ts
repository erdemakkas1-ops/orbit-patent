import "server-only";
import { durableIncrement } from "@/lib/durable-cache";

let start = Date.now(),
  requests = 0;
/** Per-instance burst guard: at most 30 model calls a minute on one instance. */
export function reserveModelCall() {
  if (Date.now() - start > 60000) {
    start = Date.now();
    requests = 0;
  }
  if (++requests > 30) throw new Error("AI_RATE_LIMITED");
}

const DEFAULT_DAILY_CALLS = 1500;

export function dailyModelCallLimit(value = process.env.AI_DAILY_CALL_LIMIT) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_CALLS;
}

/**
 * Cost ceiling shared by every instance: page views (analysis, translation,
 * claim summaries) call the model without passing an API rate limit, so a
 * crawler walking thousands of patents is capped here, not by the bill.
 * Without the shared store only the per-instance guard applies.
 */
export async function reserveDailyModelCall(now = new Date()) {
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  const used = await durableIncrement(`budget:ai-calls:${day}`, 2 * 86_400);
  if (used !== undefined && used > dailyModelCallLimit())
    throw new Error("AI_DAILY_BUDGET_EXHAUSTED");
}
