"use client";
import { useState } from "react";
import type { Locale, Patent } from "@/types/patent";
import type { ProjectIntent } from "@/types/ai";
import { messages } from "@/lib/i18n/messages";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PatentCard } from "@/components/patents/patent-card";
import { safeText } from "@/lib/ai/safety";
import Link from "next/link";
import { categorizePatent } from "@/lib/patents/discovery";
type Result = {
  intent: ProjectIntent;
  results: { patent: Patent; score: number }[];
  source: "mock" | "openai";
  patentSource: "mock" | "epo";
};
export function ProjectSearch({ locale }: { locale: Locale }) {
  const m = messages[locale];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [length, setLength] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [selectedPatentId, setSelectedPatentId] = useState<string | null>(null);
  const relatedCategory = result?.results[0]
    ? categorizePatent(result.results[0].patent)
    : null;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = String(new FormData(e.currentTarget).get("project"));
    const normalized = text.trim();
    if (normalized.length < 10) {
      setValidationError(m.projectTooShort);
      return;
    }
    if (normalized.length > 3000) {
      setValidationError(m.projectTooLong);
      return;
    }
    setValidationError(null);
    setPending(true);
    setError(false);
    setRateLimited(false);
    setResult(null);
    setSelectedPatentId(null);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: normalized, locale }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (body?.error === "RATE_LIMITED") setRateLimited(true);
        throw new Error();
      }
      setResult(await response.json());
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <form className="panel max-w-3xl" onSubmit={submit}>
        <label htmlFor="project">{m.project}</label>
        <textarea
          id="project"
          name="project"
          className="my-3 min-h-36"
          placeholder={m.example}
          minLength={10}
          maxLength={3000}
          required
          aria-describedby="project-help project-error"
          onChange={(event) => setLength(event.currentTarget.value.length)}
        />
        <div
          id="project-help"
          className="mb-3 flex justify-between text-xs muted"
        >
          <span>{m.projectTooShort}</span>
          <span>
            {length}/3000 {m.characterCount}
          </span>
        </div>
        {validationError && (
          <p id="project-error" role="alert" className="notice">
            {validationError}
          </p>
        )}
        <Button disabled={pending} type="submit">
          {pending ? m.analyzing : m.analyze}
        </Button>
      </form>
      <div aria-live="polite" aria-busy={pending} className="mt-8">
        {pending && (
          <>
            <p>{m.analyzing}</p>
            <Skeleton className="h-44 w-full" />
          </>
        )}
        {error && (
          <p role="alert" className="notice">
            {rateLimited ? m.rateLimited : m.aiUnavailable}
          </p>
        )}
        {result && (
          <>
            <p className="notice">
              {result.patentSource === "mock" ? m.mock : m.live} ·{" "}
              {result.source === "mock" ? m.aiMock : m.aiLive}
            </p>
            <section className="panel my-6">
              <h2>{m.understood}</h2>
              <div className="intent-summary mb-6 border-l-2 pl-4">
                <h3 className="mb-1">{m.summary}</h3>
                <p className="muted">
                  {safeText(result.intent.summary, m.noData, 700)}
                </p>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                {(
                  [
                    [m.keywords, result.intent.keywords],
                    [m.concepts, result.intent.concepts],
                    [m.technicalDomains, result.intent.technicalDomains],
                    [m.cpc, result.intent.suggestedCpc],
                    [m.ipc, result.intent.suggestedIpc],
                    [m.queries, result.intent.searchQueries],
                  ] as const
                ).map(([title, items]) => (
                  <div key={title}>
                    <h3 className="mb-2">{title}</h3>
                    <div className="flex flex-wrap gap-2">
                      {items.map((v, i) => (
                        <span key={i} className="badge intent-chip">
                          {safeText(v, m.noData, 160)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <h2 className="mt-8">{m.relatedPatents}</h2>
            <p className="muted text-sm">{m.scoreNote}</p>
            {result.results[0] && (
              <Link
                className="card-action mb-5 inline-block text-sm font-semibold"
                href={`/${locale}/discover${relatedCategory ? `?category=${relatedCategory}` : ""}`}
              >
                {m.relatedDiscovery}
              </Link>
            )}
            {result.results.length ? (
              <div
                className="grid-cards selectable-card-grid"
                data-has-selection={Boolean(selectedPatentId)}
              >
                {result.results.map((r) => (
                  <PatentCard
                    key={r.patent.id}
                    patent={r.patent}
                    score={r.score}
                    locale={locale}
                    selected={selectedPatentId === r.patent.id}
                    onSelect={() => setSelectedPatentId(r.patent.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="panel">
                <h2>{m.empty}</h2>
                <p>{m.emptyHint}</p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
