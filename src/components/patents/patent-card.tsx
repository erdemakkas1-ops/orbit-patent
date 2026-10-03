import type { Patent, Locale } from "@/types/patent";
import { messages } from "@/lib/i18n/messages";
import { finiteClamp } from "@/lib/ai/safety";
import { categorizePatent } from "@/lib/patents/discovery";
import { PatentSpecimen } from "@/components/patents/patent-specimen";

export function PatentCard({
  patent: p,
  locale,
  score,
}: {
  patent: Patent;
  locale: Locale;
  score?: number;
}) {
  const m = messages[locale];
  const category = categorizePatent(p);
  const safeScore =
    score === undefined ? undefined : Math.round(finiteClamp(score, 0, 100, 0));
  return (
    <PatentSpecimen
      patent={p}
      locale={locale}
      tag={
        category
          ? m.discoveryCategories[category]
          : p.source === "mock"
            ? m.cardSample
            : undefined
      }
    >
      {safeScore !== undefined && (
        <div className="specimen-score">
          <div className="score-label mb-1 flex justify-between text-xs font-semibold">
            <span>{m.score}</span>
            <span>%{safeScore}</span>
          </div>
          <div
            className="score-meter"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={safeScore}
            aria-label={`${m.score}: ${safeScore}%`}
          >
            <span style={{ width: `${safeScore}%` }} />
          </div>
        </div>
      )}
    </PatentSpecimen>
  );
}
