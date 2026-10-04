import type { Metadata } from "next";
import type { Locale } from "@/types/patent";

export const seoCopy = {
  tr: {
    homeTitle: "ORBIT – Patent Keşif ve AI Analiz Platformu",
    homeDescription:
      "Süresi dolmuş patentleri özgün çizimleri ve sicil durumuyla keşfet, korunan mekanizmayı anla, kendi versiyonunu test edilebilir hipotezlerle geliştir.",
  },
  en: {
    homeTitle: "ORBIT – Patent Discovery and AI Analysis Platform",
    homeDescription:
      "Explore expired patents with their original drawings and register status, understand the protected mechanism, and develop your own version with testable hypotheses.",
  },
} as const;

export function siteUrl(
  source: Record<string, string | undefined> = process.env,
) {
  const host =
    source.NEXT_PUBLIC_APP_URL ||
    source.VERCEL_PROJECT_PRODUCTION_URL ||
    source.VERCEL_URL;
  const candidate = host
    ? `${host.startsWith("http://") || host.startsWith("https://") ? "" : "https://"}${host}`
    : "http://localhost:3000";
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol)
      ? url
      : new URL("http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

export function buildMetadata(
  locale: Locale,
  options?: { title?: string; description?: string; path?: string },
): Metadata {
  const copy = seoCopy[locale];
  const title = options?.title ?? copy.homeTitle;
  const description = options?.description ?? copy.homeDescription;
  const path = options?.path ?? `/${locale}`;
  return {
    metadataBase: siteUrl(),
    title,
    description,
    alternates: {
      canonical: path,
      languages: {
        tr: path.replace(/^\/(tr|en)/, "/tr"),
        en: path.replace(/^\/(tr|en)/, "/en"),
      },
    },
    openGraph: {
      title,
      description,
      type: "website",
      locale: locale === "tr" ? "tr_TR" : "en_US",
      url: path,
      siteName: "ORBIT",
    },
    // The image comes from app/[locale]/opengraph-image.tsx.
    twitter: { card: "summary_large_image", title, description },
  };
}
