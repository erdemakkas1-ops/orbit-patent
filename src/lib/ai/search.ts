import "server-only";
import { analyzeProjectIntent, currentAiSource } from "./index";
import { patentProvider } from "@/lib/patents";
import { calculateRelevance } from "./engines";
import type { Locale, Patent } from "@/types/patent";
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
  const unique = new Map<string, Patent>();
  batches.forEach((b) => b.patents.forEach((p) => unique.set(p.id, p)));
  const results = [...unique.values()]
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
  return {
    intent,
    results,
    source: currentAiSource(),
    patentSource: patentProvider.source,
  };
}
