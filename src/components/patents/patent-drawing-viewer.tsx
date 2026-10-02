"use client";

import Image from "next/image";
import { useState } from "react";
import type { Locale, Patent } from "@/types/patent";
import { messages } from "@/lib/i18n/messages";
import { safeText } from "@/lib/ai/safety";

export function PatentDrawingViewer({
  patent,
  locale,
}: {
  patent: Patent;
  locale: Locale;
}) {
  const m = messages[locale];
  const [active, setActive] = useState(0);
  const current = patent.drawings[active] ?? patent.drawings[0];
  if (!current)
    return (
      <div className="drawing-viewer drawing-empty" role="status">
        {patent.drawingStatus === "unavailable"
          ? m.drawingsUnavailable
          : m.noDrawing}
      </div>
    );
  return (
    <div className="drawing-viewer">
      <div className="drawing-main">
        <Image
          src={current.url}
          alt={safeText(current.caption[locale], m.noDrawing, 200)}
          fill
          sizes="(max-width: 800px) 100vw, 40vw"
          priority={active === 0}
          className="object-contain p-5"
        />
      </div>
      {patent.drawings.length > 1 && (
        <div className="drawing-thumbnails" role="list" aria-label={m.drawings}>
          {patent.drawings.map((drawing, index) => (
            <button
              key={drawing.url}
              type="button"
              className="drawing-thumbnail"
              aria-label={`${m.drawing} ${index + 1}`}
              aria-current={index === active ? "true" : undefined}
              onClick={() => setActive(index)}
            >
              <Image
                src={drawing.url}
                alt={safeText(drawing.caption[locale], m.noDrawing, 200)}
                width={96}
                height={64}
                loading="lazy"
                className="object-contain"
              />
            </button>
          ))}
        </div>
      )}
      <p className="drawing-caption muted">{current.caption[locale]}</p>
    </div>
  );
}
