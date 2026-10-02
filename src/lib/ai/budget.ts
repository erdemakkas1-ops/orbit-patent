import "server-only";
let start = Date.now(),
  requests = 0;
/** Local protection; a distributed gateway limit is required for multiple replicas. */
export function reserveModelCall() {
  if (Date.now() - start > 60000) {
    start = Date.now();
    requests = 0;
  }
  if (++requests > 30) throw new Error("AI_RATE_LIMITED");
}
