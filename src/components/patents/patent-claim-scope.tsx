import type { Locale, Patent } from "@/types/patent";
import { messages } from "@/lib/i18n/messages";
import { patentProvider } from "@/lib/patents";
import { summarizeClaims } from "@/lib/ai";
import { espacenetUrl } from "@/lib/patents/format";

const MAX_INDEPENDENT = 3;

export function PatentClaimScopeLoading({ locale }: { locale: Locale }) {
  const m = messages[locale];
  return (
    <section className="panel mt-6" aria-busy="true" role="status">
      <h2>{m.claimScopeTitle}</h2>
      <p className="muted">{m.loading}</p>
    </section>
  );
}

/** "What is protected?": independent claims read in plain language, sourced. */
export async function PatentClaimScope({
  patent,
  locale,
}: {
  patent: Patent;
  locale: Locale;
}) {
  const m = messages[locale];
  const claims = await patentProvider
    .getPatentClaims?.(patent.id)
    .catch(() => null);
  const independent = (claims?.claims ?? [])
    .filter((claim) => claim.independent)
    .slice(0, MAX_INDEPENDENT);
  const source = (
    <a
      className="card-action text-sm font-semibold"
      href={espacenetUrl(patent.publicationNumber)}
      target="_blank"
      rel="noopener noreferrer"
    >
      {m.originalDocument}
    </a>
  );
  if (!independent.length)
    return (
      <section className="panel mt-6">
        <h2>{m.claimScopeTitle}</h2>
        <p className="muted">{m.claimsUnavailable}</p>
        {source}
      </section>
    );
  const scope = await summarizeClaims(patent, independent, locale).catch(
    () => null,
  );
  return (
    <section className="panel mt-6">
      <h2>{m.claimScopeTitle}</h2>
      {scope ? (
        <>
          <p>{scope.summary}</p>
          <p className="mb-2 text-xs muted">{m.claimScopeAiNote}</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {scope.claimNumbers.map((number) => (
              <span className="metric-chip" key={number}>
                {m.claim} {number}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="muted">{m.analysisUnavailable}</p>
      )}
      {independent.map((claim) => (
        <details key={claim.number} className="claim-original">
          <summary>
            {m.claim} {claim.number} · {m.originalText}
            {claims?.language ? ` (${claims.language})` : ""}
          </summary>
          <p lang={claims?.language.toLowerCase() || undefined}>
            {claim.text}
          </p>
        </details>
      ))}
      <p className="mt-4 text-sm muted">{m.claimScopeNotice}</p>
      {source}
    </section>
  );
}
