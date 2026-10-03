import type {
  CostEstimate,
  DifficultyAnalysis,
  DifficultyInput,
  Material,
  ProjectIntent,
} from "@/types/ai";
import type { Locale, Patent } from "@/types/patent";
import { fold } from "@/lib/patents/search-schema";
import { finiteClamp } from "./safety";
export function calculateDifficulty(
  input: DifficultyInput,
): DifficultyAnalysis {
  const b = input.breakdown;
  const overall =
    b.electronics * 0.2 +
    b.software * 0.15 +
    b.mechanical * 0.25 +
    b.manufacturing * 0.2 +
    b.testing * 0.2;
  return {
    breakdown: Object.fromEntries(
      Object.entries(b).map(([k, v]) => [
        k,
        Math.round(finiteClamp(v, 0, 10, 5) * 10) / 10,
      ]),
    ) as DifficultyInput["breakdown"],
    reasons: input.reasons,
    overall: Math.round(finiteClamp(overall, 0, 10, 5) * 10) / 10,
  };
}
export function calculateCost(
  items: Material[],
  assumptions: string[],
  locale: Locale,
): CostEstimate {
  const normalized = items.map((item) => ({
    ...item,
    quantity: finiteClamp(item.quantity, 1, 1000, 1),
    estimatedUnitCost: finiteClamp(item.estimatedUnitCost, 0, 10_000_000, 0),
    subtotal:
      Math.round(
        finiteClamp(item.quantity, 1, 1000, 1) *
          finiteClamp(item.estimatedUnitCost, 0, 10_000_000, 0) *
          100,
      ) / 100,
  }));
  const base = normalized.reduce((sum, item) => sum + item.subtotal, 0);
  return {
    min: Math.round(base),
    max: Math.round(base * 1.25),
    currency: "TRY",
    items: normalized,
    assumptions,
    warning:
      locale === "tr"
        ? "Bu maliyet tahmini doğrulanmış piyasa fiyatı değildir."
        : "This cost estimate is not a verified market price.",
  };
}
const tokens = (value: string) =>
  new Set(
    fold(value)
      .split(/[^a-z0-9çğıöşü]+/)
      .filter((x) => x.length > 2),
  );
const overlap = (needles: string[], haystack: string) =>
  needles.length
    ? needles.filter((x) => fold(haystack).includes(fold(x))).length /
      needles.length
    : 0;
/** Average share of each phrase's words found in the text ("pet feeder" half-matches "cat feeder"). */
const coverage = (phrases: string[], haystack: string) => {
  const words = tokens(haystack);
  const shares = phrases
    .map((phrase) => [...tokens(phrase)])
    .filter((parts) => parts.length)
    .map(
      (parts) => parts.filter((part) => words.has(part)).length / parts.length,
    );
  return shares.length
    ? shares.reduce((sum, share) => sum + share, 0) / shares.length
    : 0;
};
const similarity = (a: string, b: string) => {
  const aa = tokens(a),
    bb = tokens(b);
  if (!aa.size || !bb.size) return 0;
  const intersection = [...aa].filter((x) => bb.has(x)).length;
  return intersection / new Set([...aa, ...bb]).size;
};
export function calculateRelevance(intent: ProjectIntent, patent: Patent) {
  const title = `${patent.title.tr} ${patent.title.en}`;
  const abstract = `${patent.abstract.tr} ${patent.abstract.en}`;
  const corpus = `${title} ${abstract}`;
  // Keywords follow the UI language while patent text is mostly English;
  // the English search queries give a Turkish intent something to match.
  const queries = intent.searchQueries;
  const terms = [...intent.keywords, ...intent.concepts, ...queries].join(" ");
  const parts = {
    keyword: Math.max(
      overlap(intent.keywords, corpus),
      coverage(queries, corpus),
    ),
    concept: overlap(intent.concepts, corpus),
    cpc: intent.suggestedCpc.length
      ? intent.suggestedCpc.filter((c) =>
          patent.cpc.some((p) => fold(p).startsWith(fold(c))),
        ).length / intent.suggestedCpc.length
      : 0,
    ipc: intent.suggestedIpc.length
      ? intent.suggestedIpc.filter((c) =>
          patent.ipc.some((p) => fold(p).startsWith(fold(c))),
        ).length / intent.suggestedIpc.length
      : 0,
    title: similarity(terms, title),
    abstract: similarity(terms, abstract),
  };
  const score =
    parts.keyword * 20 +
    parts.concept * 20 +
    parts.cpc * 20 +
    parts.ipc * 10 +
    parts.title * 15 +
    parts.abstract * 15;
  return {
    score: Math.round(finiteClamp(score, 0, 100, 0)),
    contributions: Object.fromEntries(
      Object.entries(parts).map(([key, value]) => [
        key,
        finiteClamp(value, 0, 1, 0),
      ]),
    ) as typeof parts,
  };
}
