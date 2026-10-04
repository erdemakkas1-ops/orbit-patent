import "server-only";
import { analyzeProjectIntent, currentAiSource } from "./index";
import { patentProvider } from "@/lib/patents";
import { hydratePatentReferences } from "@/lib/patents/providers/epo";
import { calculateRelevance } from "./engines";
import { localizePatentCards } from "./translation";
import type { Locale, Patent } from "@/types/patent";
const MAX_LIVE_CANDIDATES = 12;
/** Bounded query fan-out and deterministic ranking; never invents patent records. */
export async function searchProject(text: string, locale: Locale) {
  const intent = await analyzeProjectIntent(text, locale);
  const queries = intent.searchQueries.slice(0, 3);
  const settledBatches = await Promise.allSettled([
    ...queries.map((q) =>
      patentProvider.searchPatents({ q, sort: "relevance", page: 1 }),
    ),
    ...intent.suggestedCpc
      .slice(0, 2)
      .map((cpc) =>
        patentProvider.searchPatents({ cpc, sort: "relevance", page: 1 }),
      ),
  ]);
  const batches = settledBatches.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  // Interleave so every query's best hits reach the (bounded) hydration step.
  const unique = new Map<string, Patent>();
  const longest = Math.max(0, ...batches.map((b) => b.patents.length));
  for (let rank = 0; rank < longest; rank++)
    for (const batch of batches) {
      const patent = batch.patents[rank];
      if (patent && !unique.has(patent.id)) unique.set(patent.id, patent);
    }
  // Live search hits are bare references (no title/abstract/CPC); score full records.
  const candidates =
    patentProvider.source === "epo"
      ? await hydratePatentReferences(
          [...unique.values()],
          (id) => patentProvider.getPatentById(id),
          MAX_LIVE_CANDIDATES,
        )
      : [...unique.values()];
  const results = candidates
    .map((p) => {
      const relevance = calculateRelevance(intent, p);
      return {
        patent: p,
        score: relevance.score,
        contributions: relevance.contributions,
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 9);
  const localized = await localizePatentCards(
    results.map((r) => r.patent),
    locale,
  );
  return {
    intent,
    results: results.map((r, index) => ({ ...r, patent: localized[index] })),
    source: currentAiSource(),
    patentSource: patentProvider.source,
  };
}
