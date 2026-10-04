import { ImageResponse } from "next/og";
import { isLocale, messages } from "@/lib/i18n/messages";

export const alt = "ORBIT";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BLUEPRINT = "#0f2a5c";
const SIGNAL = "#ff5b1f";
const MUTED = "#b9c6e4";

/** Link preview: the site's blueprint sheet with the headline and promise. */
export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: value } = await params;
  const m = messages[isLocale(value) ? value : "tr"];
  const grid = "rgba(255,255,255,0.07)";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: BLUEPRINT,
          backgroundImage: `linear-gradient(${grid} 1px, transparent 1px), linear-gradient(90deg, ${grid} 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
          color: "#ffffff",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 32,
            left: 32,
            width: 40,
            height: 40,
            borderTop: `4px solid ${SIGNAL}`,
            borderLeft: `4px solid ${SIGNAL}`,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 32,
            right: 32,
            width: 40,
            height: 40,
            borderBottom: `4px solid ${SIGNAL}`,
            borderRight: `4px solid ${SIGNAL}`,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: 12,
            }}
          >
            ORBIT
          </div>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: SIGNAL,
              marginTop: -18,
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              fontSize: 68,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 980,
            }}
          >
            {m.headline}
          </div>
          <div
            style={{ display: "flex", fontSize: 28, color: MUTED, maxWidth: 940 }}
          >
            {`${m.featuredExpiredTitle} · ${m.heroProof.join(" · ")}`}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 22, color: MUTED }}>
          {m.eyebrow}
        </div>
      </div>
    ),
    size,
  );
}
