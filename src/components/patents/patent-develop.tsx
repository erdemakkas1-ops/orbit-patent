"use client";
import { useState } from "react";
import type { Locale } from "@/types/patent";
import {
  developmentDirections,
  type DevelopmentDirection,
  type DevelopmentHypothesis,
} from "@/types/ai";
import { messages } from "@/lib/i18n/messages";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** "Develop": pick a direction, optionally describe a problem, get hypotheses. */
export function PatentDevelop({
  patentId,
  locale,
}: {
  patentId: string;
  locale: Locale;
}) {
  const m = messages[locale];
  const [direction, setDirection] = useState<DevelopmentDirection>("cheaper");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hypotheses, setHypotheses] = useState<DevelopmentHypothesis[] | null>(
    null,
  );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = String(new FormData(event.currentTarget).get("problem"));
    setPending(true);
    setError(null);
    setHypotheses(null);
    try {
      const response = await fetch("/api/ai/develop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: patentId, direction, problem, locale }),
        signal: AbortSignal.timeout(60000),
      });
      const body = (await response.json().catch(() => null)) as {
        hypotheses?: DevelopmentHypothesis[];
        error?: string;
      } | null;
      if (!response.ok || !body?.hypotheses) {
        setError(
          body?.error === "RATE_LIMITED" ? m.rateLimited : m.aiUnavailable,
        );
        return;
      }
      setHypotheses(body.hypotheses);
    } catch {
      setError(m.aiUnavailable);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="panel mt-6" aria-labelledby="develop-title">
      <p className="eyebrow">{m.developEyebrow}</p>
      <h2 id="develop-title" className="mt-2">
        {m.developTitle}
      </h2>
      <p className="muted max-w-2xl text-sm">{m.developIntro}</p>
      <form className="mt-5" onSubmit={submit}>
        <fieldset className="develop-directions">
          <legend className="sr-only">{m.developDirectionLegend}</legend>
          {developmentDirections.map((value) => (
            <label key={value} className="develop-direction">
              <input
                type="radio"
                name="direction"
                value={value}
                checked={direction === value}
                onChange={() => setDirection(value)}
              />
              <span className="develop-direction-label">
                {m.developDirections[value].label}
              </span>
              <span className="develop-direction-hint">
                {m.developDirections[value].hint}
              </span>
            </label>
          ))}
        </fieldset>
        <label htmlFor="develop-problem" className="mt-5">
          {m.developProblemLabel}
        </label>
        <textarea
          id="develop-problem"
          name="problem"
          className="mt-2 min-h-20"
          maxLength={500}
          placeholder={m.developProblemPlaceholder}
          aria-describedby="develop-privacy"
        />
        <p id="develop-privacy" className="mb-4 mt-1 text-xs muted">
          {m.developPrivacy}
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? m.developPending : m.developSubmit}
        </Button>
      </form>
      <div aria-live="polite" aria-busy={pending} className="mt-6">
        {pending && <Skeleton className="h-40 w-full" />}
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        {hypotheses && (
          <ol className="develop-hypotheses">
            {hypotheses.map((item, index) => (
              <li key={`${item.title}-${index}`} className="develop-hypothesis">
                <p className="develop-hypothesis-badge">
                  H{index + 1} · {m.developHypothesisBadge}
                </p>
                <h3>{item.title}</h3>
                <p>{item.idea}</p>
                <dl>
                  <dt>{m.developBasis}</dt>
                  <dd>{item.basis}</dd>
                  <dt>{m.developUncertainty}</dt>
                  <dd>{item.uncertainty}</dd>
                  <dt>{m.developTest}</dt>
                  <dd>{item.test}</dd>
                </dl>
              </li>
            ))}
          </ol>
        )}
        {hypotheses && <p className="text-xs muted">{m.developDisclaimer}</p>}
      </div>
    </section>
  );
}
