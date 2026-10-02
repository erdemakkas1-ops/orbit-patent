import type {
  CostEstimate,
  DifficultyAnalysis,
  ModernizationSuggestion,
  Simplification,
} from "@/types/ai";
import type { Locale, Localized, Patent } from "@/types/patent";

export const finiteClamp = (
  value: number,
  min: number,
  max: number,
  fallback = min,
) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));

export function safeText(value: unknown, fallback: string, max = 500) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function localizedText(
  value: Localized | undefined,
  locale: Locale,
  fallback: string,
  max = 500,
) {
  return safeText(
    value?.[locale] || value?.[locale === "tr" ? "en" : "tr"],
    fallback,
    max,
  );
}

export function normalizeDifficulty(
  value: DifficultyAnalysis,
): DifficultyAnalysis {
  const breakdown = Object.fromEntries(
    Object.entries(value.breakdown).map(([key, score]) => [
      key,
      Math.round(finiteClamp(score, 0, 10, 5) * 10) / 10,
    ]),
  ) as DifficultyAnalysis["breakdown"];
  const overall =
    breakdown.electronics * 0.2 +
    breakdown.software * 0.15 +
    breakdown.mechanical * 0.25 +
    breakdown.manufacturing * 0.2 +
    breakdown.testing * 0.2;
  return {
    breakdown,
    overall: Math.round(finiteClamp(overall, 0, 10, 5) * 10) / 10,
    reasons: value.reasons.filter((item) => item.reason.trim()).slice(0, 10),
  };
}

export function normalizeCost(
  value: CostEstimate,
  locale: Locale,
): CostEstimate {
  const items = value.items
    .filter((item) => item.name.trim())
    .map((item) => {
      const quantity = finiteClamp(item.quantity, 1, 1000, 1);
      const estimatedUnitCost = finiteClamp(
        item.estimatedUnitCost,
        0,
        10_000_000,
        0,
      );
      return {
        ...item,
        quantity,
        estimatedUnitCost,
        subtotal: Math.round(quantity * estimatedUnitCost * 100) / 100,
      };
    });
  const base = items.reduce((sum, item) => sum + item.subtotal, 0);
  const min = Math.round(finiteClamp(base || value.min, 0, 300_000_000, 0));
  const max = Math.max(
    min,
    Math.round(
      finiteClamp(base ? base * 1.25 : value.max, 0, 300_000_000, min),
    ),
  );
  return {
    ...value,
    min,
    max,
    currency: "TRY",
    items,
    warning:
      locale === "tr"
        ? "Bu maliyet tahmini doğrulanmış piyasa fiyatı değildir."
        : "This cost estimate is not a verified market price.",
  };
}

export function normalizeSimplification(
  value: Simplification,
  fallback: string,
): Simplification {
  return {
    functionSummary: safeText(value.functionSummary, fallback, 700),
    whyInterestingToday: safeText(value.whyInterestingToday, fallback, 500),
    keyTechnicalIdea: safeText(value.keyTechnicalIdea, fallback, 500),
    limitations: [
      ...new Set(
        value.limitations
          .map((item) => safeText(item, "", 300))
          .filter(Boolean),
      ),
    ].slice(0, 8),
  };
}

export function normalizeModernization(
  items: ModernizationSuggestion[],
): ModernizationSuggestion[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = item.title.trim().toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => ({
      ...item,
      title: safeText(item.title, "", 160),
      description: safeText(item.description, "", 500),
      benefit: safeText(item.benefit, "", 300),
      difficultyImpact: finiteClamp(item.difficultyImpact, -3, 3, 0),
      estimatedCostImpact: finiteClamp(
        item.estimatedCostImpact,
        -1_000_000,
        1_000_000,
        0,
      ),
    }))
    .slice(0, 8);
}

export function patentDisplay(
  patent: Patent,
  locale: Locale,
  fallback: string,
) {
  return {
    title: localizedText(patent.title, locale, fallback, 240),
    abstract: localizedText(patent.abstract, locale, fallback, 1200),
    description: localizedText(patent.description, locale, fallback, 4000),
  };
}
