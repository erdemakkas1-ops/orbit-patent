"use client";
import Link from "next/link";
import Image from "next/image";
import type { Patent, Locale } from "@/types/patent";
import { messages } from "@/lib/i18n/messages";
import { finiteClamp, patentDisplay, safeText } from "@/lib/ai/safety";
import { ExpandingPatentCard } from "@/components/ui/expanding-patent-card";
export function PatentCard({
  patent: p,
  locale,
  score,
  selected = false,
  onSelect,
}: {
  patent: Patent;
  locale: Locale;
  score?: number;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const m = messages[locale];
  const display = patentDisplay(p, locale, m.noData);
  const drawing = p.drawings[0];
  const drawingUrl = drawing?.url.startsWith("/api/patents/")
    ? `${drawing.url}${drawing.url.includes("?") ? "&" : "?"}variant=card`
    : drawing?.url;
  const safeScore =
    score === undefined ? undefined : Math.round(finiteClamp(score, 0, 100, 0));
  return (
    <ExpandingPatentCard
      selected={selected}
      className="flex flex-col overflow-hidden"
    >
      <div className="card-media flex h-32 items-center justify-center border-b">
        {drawing && drawingUrl ? (
          <Image
            className="h-full w-full object-contain"
            src={drawingUrl}
            alt={safeText(drawing.caption[locale], m.noDrawing, 200)}
            width={290}
            height={136}
            loading="lazy"
          />
        ) : (
          <span className="muted">{m.noDrawing}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          {(p.source === "mock" || p.legalStatus !== "UNKNOWN") && (
            <span className={`badge status-${p.legalStatus.toLowerCase()}`}>
              {m.statuses[p.legalStatus]}
            </span>
          )}
          <span className="badge source-badge">
            {p.source === "mock" ? m.mock : m.live}
          </span>
          <span className="text-sm muted">
            {safeText(p.publicationDate?.slice(0, 4), m.noData, 4)}
          </span>
        </div>
        <p className="text-xs muted break-all">{p.publicationNumber}</p>
        <h3 className="mb-3">
          <Link className="card-title-link" href={`/${locale}/patents/${p.id}`}>
            {display.title}
          </Link>
        </h3>
        <p className="muted text-sm line-clamp-3">{display.abstract}</p>
        <div className="mb-5 flex flex-wrap gap-2">
          {p.cpc.map((c) => (
            <span className="badge" key={c}>
              {m.cpc} {c}
            </span>
          ))}
          {p.ipc.map((c) => (
            <span className="badge" key={c}>
              {m.ipc} {c}
            </span>
          ))}
        </div>
        {safeScore !== undefined && (
          <div className="mb-4">
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
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
          <Link
            className="card-action text-sm font-semibold"
            href={`/${locale}/patents/${p.id}`}
          >
            {m.details}
          </Link>
          {onSelect && (
            <button
              type="button"
              className="card-select"
              aria-pressed={selected}
              aria-label={`${selected ? m.selectedPatent : m.selectPatent}: ${display.title}`}
              onClick={onSelect}
            >
              {selected ? m.selectedPatent : m.selectPatent}
            </button>
          )}
        </div>
      </div>
    </ExpandingPatentCard>
  );
}
