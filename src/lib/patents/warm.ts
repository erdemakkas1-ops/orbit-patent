import "server-only";
import { patentProvider } from "@/lib/patents";
import { localizePatentCards } from "@/lib/ai/translation";
import { discoveryWarmList } from "@/lib/patents/discovery";

const PARALLEL_PAGES = 2;

/**
 * Rebuilds the discover pages and their Turkish card translations so no
 * visitor waits on a cold EPO search + lookup + translation. Records and
 * translations come from the durable cache when unchanged, so a daily run
 * mostly costs the searches. Stops before `deadline` to fit the function limit.
 */
export async function warmDiscovery(deadline: number) {
  const pending = discoveryWarmList();
  let warmed = 0;
  let failed = 0;
  const worker = async () => {
    while (pending.length && Date.now() < deadline) {
      const filters = pending.shift()!;
      try {
        const result = await patentProvider.discoverPatents!(filters, {
          refresh: true,
        });
        await localizePatentCards(result.patents, "tr");
        warmed += 1;
      } catch {
        failed += 1;
      }
    }
  };
  if (patentProvider.discoverPatents)
    await Promise.all(Array.from({ length: PARALLEL_PAGES }, worker));
  const featured = await patentProvider
    .getFeaturedPatents?.(3)
    .catch(() => []);
  if (featured?.length) await localizePatentCards(featured, "tr");
  return { warmed, failed, skipped: pending.length };
}
