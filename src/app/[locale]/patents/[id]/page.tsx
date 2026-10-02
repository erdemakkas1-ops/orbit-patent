import { notFound } from "next/navigation";
import Link from "next/link";
import { isLocale, messages } from "@/lib/i18n/messages";
import { analyzePatent } from "@/lib/ai";
import { getPatent } from "@/lib/patents/get-patent";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import {
  normalizeCost,
  normalizeDifficulty,
  normalizeModernization,
  normalizeSimplification,
  patentDisplay,
  safeText,
} from "@/lib/ai/safety";
import { PatentDrawingViewer } from "@/components/patents/patent-drawing-viewer";
import { localizePatents } from "@/lib/ai/translation";

type DetailProps = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({
  params,
}: DetailProps): Promise<Metadata> {
  const { locale: value, id } = await params;
  const locale = isLocale(value) ? value : "tr";
  const patent = await getPatent(id).catch(() => null);
  const m = messages[locale];
  if (!patent)
    return buildMetadata(locale, {
      title: m.notFound,
      path: `/${locale}/patents/${encodeURIComponent(id)}`,
    });
  const [localizedPatent] = await localizePatents([patent], locale);
  const title = patentDisplay(localizedPatent, locale, m.noData).title;
  return buildMetadata(locale, {
    title: `${title} – ${safeText(patent.publicationNumber, m.noData, 120)}`,
    description: patentDisplay(localizedPatent, locale, m.noData).abstract,
    path: `/${locale}/patents/${encodeURIComponent(id)}`,
  });
}

export default async function Detail({ params }: DetailProps) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const m = messages[locale];
  const sourcePatent = await getPatent(id);
  if (!sourcePatent) notFound();
  const [p] = await localizePatents([sourcePatent], locale);
  const display = patentDisplay(p, locale, m.noData);
  const raw = await analyzePatent(p, locale).catch(() => null);
  const analysis = raw
    ? {
        ...raw,
        simplification: normalizeSimplification(raw.simplification, m.noData),
        modernization: normalizeModernization(raw.modernization),
        build: {
          ...raw.build,
          difficulty: normalizeDifficulty(raw.build.difficulty),
          cost: normalizeCost(raw.build.cost, locale),
        },
      }
    : null;
  const build = analysis?.build;
  const materials = build?.cost.items ?? [];
  const categoryTotals = Object.entries(
    materials.reduce<Record<string, number>>((totals, item) => {
      totals[item.category] = (totals[item.category] ?? 0) + item.subtotal;
      return totals;
    }, {}),
  );
  const money = (value: number) =>
    new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-US", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 0,
    }).format(Number.isFinite(value) ? value : 0);

  return (
    <>
      <Link href={`/${locale}/patents`} className="card-action text-sm">
        {m.back}
      </Link>
      <section className="detail-hero mt-8">
        <PatentDrawingViewer patent={p} locale={locale} />
        <div className="detail-hero-copy">
          <p className="eyebrow break-all">
            {safeText(p.publicationNumber, m.noData, 120)}
          </p>
          <h1 className="my-4 max-w-4xl break-words">{display.title}</h1>
          <div className="mb-4 flex flex-wrap gap-2">
            <span className={`badge status-${p.legalStatus.toLowerCase()}`}>
              {m.statuses[p.legalStatus]}
            </span>
            {analysis && (
              <span className="badge">
                {analysis.source === "mock" ? m.aiBadgeMock : m.aiBadgeLive}
              </span>
            )}
            <span className="badge">{p.publicationDate.slice(0, 4)}</span>
          </div>
          {p.source === "mock" && (
            <p className="notice mb-4" role="status">
              {m.patentDemo}
            </p>
          )}
          <p className="detail-summary">{display.abstract}</p>
          <dl className="detail-hero-meta">
            <div>
              <dt>{m.applicants}</dt>
              <dd>{p.applicants.join(", ") || m.noData}</dd>
            </div>
            <div>
              <dt>{m.inventors}</dt>
              <dd>{p.inventors.join(", ") || m.noData}</dd>
            </div>
            <div>
              <dt>{m.cpc}</dt>
              <dd>{p.cpc.join(", ") || m.noData}</dd>
            </div>
            <div>
              <dt>{m.ipc}</dt>
              <dd>{p.ipc.join(", ") || m.noData}</dd>
            </div>
          </dl>
        </div>
      </section>

      {!analysis ? (
        <section className="panel" role="status">
          <h2>{m.aiUnavailable}</h2>
          <p className="muted">{m.analysisUnavailable}</p>
        </section>
      ) : (
        <div className="detail-grid">
          <div className="space-y-6">
            <section className="panel">
              <h2>{m.function}</h2>
              <p>{analysis.simplification.functionSummary}</p>
              <h2>{m.interesting}</h2>
              <p className="muted">
                {analysis.simplification.whyInterestingToday}
              </p>
              <h3>{m.keyTechnicalIdea}</h3>
              <p className="muted">
                {analysis.simplification.keyTechnicalIdea}
              </p>
              <h3>{m.limitations}</h3>
              {analysis.simplification.limitations.length ? (
                <ul className="list-disc pl-5 text-sm muted">
                  {analysis.simplification.limitations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">{m.noData}</p>
              )}
            </section>

            <section className="panel">
              <h2>{m.materials}</h2>
              {materials.length ? (
                <div className="table-scroll" tabIndex={0}>
                  <table className="materials-table">
                    <colgroup>
                      <col className="materials-col-name" />
                      <col className="materials-col-quantity" />
                      <col className="materials-col-cost" />
                      <col className="materials-col-category" />
                      <col className="materials-col-reason" />
                    </colgroup>
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
                      {materials.map((item, index) => (
                        <tr key={`${item.name}-${index}`}>
                          <td>
                            {item.name}
                            {item.replacementFor && (
                              <span className="mt-1 block text-xs muted">
                                {m.replacementFor}: {item.replacementFor}
                              </span>
                            )}
                          </td>
                          <td>{item.quantity}</td>
                          <td>{money(item.estimatedUnitCost)}</td>
                          <td>{m.categories[item.category]}</td>
                          <td>{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">{m.noMaterials}</p>
              )}
            </section>

            <section className="panel">
              <h2>{m.modern}</h2>
              {analysis.modernization.length ? (
                <ol className="list-decimal space-y-5 pl-5">
                  {analysis.modernization.map((item) => (
                    <li key={item.title}>
                      <strong>{item.title}</strong>
                      <p className="mb-1 muted">{item.description}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="metric-chip">
                          {m.difficultyImpact}:{" "}
                          {item.difficultyImpact >= 0 ? "+" : ""}
                          {item.difficultyImpact}/10
                        </span>
                        <span className="metric-chip">
                          {m.costImpact}:{" "}
                          {item.estimatedCostImpact >= 0 ? "+" : ""}
                          {money(item.estimatedCostImpact)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">{m.noSuggestions}</p>
              )}
            </section>
          </div>

          <aside className="space-y-6">
            <section className="panel">
              <h2>{m.difficulty}</h2>
              <p className="detail-accent text-5xl font-semibold">
                {build?.difficulty.overall}
                <span className="muted text-xl"> /10</span>
              </p>
              <dl>
                {build &&
                  Object.entries(build.difficulty.breakdown).map(
                    ([key, score]) => (
                      <div key={key} className="my-3">
                        <div className="flex justify-between text-sm">
                          <dt>
                            {m[key as keyof typeof build.difficulty.breakdown]}
                          </dt>
                          <dd className="!mb-1">{score}/10</dd>
                        </div>
                        <progress
                          aria-label={
                            m[key as keyof typeof build.difficulty.breakdown]
                          }
                          className={`difficulty-progress difficulty-${score >= 7 ? "high" : score >= 4 ? "medium" : "low"} h-1.5 w-full`}
                          value={score}
                          max={10}
                        />
                      </div>
                    ),
                  )}
              </dl>
            </section>
            <section className="panel">
              <h2>{m.cost}</h2>
              {materials.length ? (
                <p className="detail-accent text-2xl font-semibold">
                  {money(build?.cost.min ?? 0)} – {money(build?.cost.max ?? 0)}
                </p>
              ) : (
                <p className="muted">{m.noMaterials}</p>
              )}
              <p className="text-xs muted">
                {m.asOf}: {analysis.asOf}
              </p>
              <p className="text-sm muted">{m.estimateNotice}</p>
              {categoryTotals.length > 0 && (
                <dl className="my-4">
                  {categoryTotals.map(([category, total]) => (
                    <div
                      key={category}
                      className="detail-divider flex justify-between border-b py-2 text-sm"
                    >
                      <dt>
                        {m.categories[category as keyof typeof m.categories] ??
                          category}
                      </dt>
                      <dd className="!mb-0">{money(total)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <h3>{m.assumptions}</h3>
              {build?.cost.assumptions.length ? (
                <ul className="list-disc pl-5 text-sm muted">
                  {build.cost.assumptions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">{m.noData}</p>
              )}
            </section>
          </aside>
        </div>
      )}

      <section className="panel mt-6">
        <h2>{m.original}</h2>
        <div className="original-info-grid">
          <div>
            <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              {(
                [
                  [m.publication, p.publicationNumber],
                  [m.application, p.applicationNumber],
                  [m.publicationDate, p.publicationDate],
                  [m.applicationDate, p.applicationDate],
                  [m.priorityDate, p.priorityDate],
                  [m.inventors, p.inventors.join(", ")],
                  [m.applicants, p.applicants.join(", ")],
                  [m.cpc, p.cpc.join(", ")],
                  [m.ipc, p.ipc.join(", ")],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{safeText(value, m.noData, 1000)}</dd>
                </div>
              ))}
            </dl>
            <h3 className="mb-3">{m.description}</h3>
            <p className="muted whitespace-pre-line">{display.description}</p>
            <h3 className="mb-3">{m.family}</h3>
            {p.family.length ? (
              p.family.map((item) => (
                <p
                  key={`${item.publicationNumber}-${item.country}`}
                  className="text-sm break-all"
                >
                  {item.publicationNumber} · {item.country}
                </p>
              ))
            ) : (
              <p>{m.noData}</p>
            )}
          </div>
        </div>
      </section>

      <section className="panel mt-6">
        <h2>{m.events}</h2>
        {p.legalEvents.length ? (
          <ol className="timeline">
            {p.legalEvents.map((event) => (
              <li key={event.id} className="timeline-item">
                <div className="text-sm muted">
                  {safeText(event.date, m.noData, 40)} ·{" "}
                  {safeText(event.jurisdiction, m.noData, 40)}
                </div>
                <strong>{m.eventKinds[event.kind]}</strong>
                <p className="text-sm muted">
                  {safeText(event.description[locale], m.noData, 500)}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p>{m.noEvents}</p>
        )}
      </section>
      <p className="notice mt-6">{m.legalNotice}</p>
    </>
  );
}
