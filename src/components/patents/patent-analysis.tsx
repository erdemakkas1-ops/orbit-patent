import type { Locale, Patent } from "@/types/patent";
import { messages } from "@/lib/i18n/messages";
import { analyzePatent } from "@/lib/ai";
import {
  normalizeCost,
  normalizeDifficulty,
  normalizeModernization,
  normalizeSimplification,
} from "@/lib/ai/safety";

export function PatentAnalysisLoading({ locale }: { locale: Locale }) {
  return (
    <section className="panel" aria-busy="true" role="status">
      <h2>{messages[locale].loading}</h2>
      <p className="muted">{messages[locale].analyzing}</p>
    </section>
  );
}

export async function PatentAnalysis({
  patent,
  locale,
}: {
  patent: Patent;
  locale: Locale;
}) {
  const m = messages[locale];
  const raw = await analyzePatent(patent, locale).catch(() => null);
  if (!raw)
    return (
      <section className="panel" role="status">
        <h2>{m.aiUnavailable}</h2>
        <p className="muted">{m.analysisUnavailable}</p>
      </section>
    );
  const simplification = normalizeSimplification(raw.simplification, m.noData);
  const modernization = normalizeModernization(raw.modernization);
  const difficulty = normalizeDifficulty(raw.build.difficulty);
  const cost = normalizeCost(raw.build.cost, locale);
  const money = (value: number) =>
    new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-US", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 0,
    }).format(value);
  return (
    <div className="detail-grid">
      <div className="space-y-6">
        <section className="panel">
          <h2>{m.function}</h2>
          <p>{simplification.functionSummary}</p>
          <h2>{m.interesting}</h2>
          <p className="muted">{simplification.whyInterestingToday}</p>
          <h3>{m.keyTechnicalIdea}</h3>
          <p className="muted">{simplification.keyTechnicalIdea}</p>
          <h3>{m.limitations}</h3>
          <ul className="list-disc pl-5 text-sm muted">
            {simplification.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h2>{m.materials}</h2>
          <div className="table-scroll" tabIndex={0}>
            <table className="materials-table">
              <thead>
                <tr>
                  <th>{m.material}</th>
                  <th>{m.quantity}</th>
                  <th>{m.unit}</th>
                  <th>{m.category}</th>
                  <th>{m.reason}</th>
                </tr>
              </thead>
              <tbody>
                {cost.items.map((item, index) => (
                  <tr key={`${item.name}-${index}`}>
                    <td>{item.name}</td>
                    <td>{item.quantity}</td>
                    <td>{money(item.estimatedUnitCost)}</td>
                    <td>{m.categories[item.category]}</td>
                    <td>{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <h2>{m.modern}</h2>
          <ol className="list-decimal space-y-5 pl-5">
            {modernization.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong>
                <p className="muted">{item.description}</p>
                <p className="text-sm muted">{item.benefit}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="metric-chip">
                    {m.difficultyImpact}:{" "}
                    {item.difficultyImpact >= 0 ? "+" : ""}
                    {item.difficultyImpact}/10
                  </span>
                  <span className="metric-chip">
                    {m.costImpact}: {item.estimatedCostImpact >= 0 ? "+" : ""}
                    {money(item.estimatedCostImpact)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <aside className="space-y-6">
        <section className="panel">
          <h2>{m.difficulty}</h2>
          <p className="detail-accent text-5xl font-semibold">
            {difficulty.overall}
            <span className="muted text-xl"> /10</span>
          </p>
          <dl>
            {Object.entries(difficulty.breakdown).map(([key, score]) => (
              <div key={key} className="my-3">
                <div className="flex justify-between text-sm">
                  <dt>{m[key as keyof typeof difficulty.breakdown]}</dt>
                  <dd>{score}/10</dd>
                </div>
                <progress
                  className="h-1.5 w-full"
                  value={score}
                  max={10}
                  aria-label={key}
                />
              </div>
            ))}
          </dl>
        </section>
        <section className="panel">
          <h2>{m.cost}</h2>
          <p className="detail-accent text-2xl font-semibold">
            {money(cost.min)} – {money(cost.max)}
          </p>
          <p className="text-xs muted">
            {m.asOf}: {raw.asOf}
          </p>
          <p className="text-sm muted">{m.estimateNotice}</p>
        </section>
      </aside>
    </div>
  );
}
