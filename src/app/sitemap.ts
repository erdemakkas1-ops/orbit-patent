import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl().toString().replace(/\/$/, "");
  const routes = ["", "/discover", "/patents", "/ai-search"];
  // TODO(M9): add real patent detail URLs when the live EPO source is approved.
  return (["tr", "en"] as const).flatMap((locale) =>
    routes.map((route) => ({
      url: `${base}/${locale}${route}`,
      changeFrequency: route === "" ? ("weekly" as const) : ("daily" as const),
      priority: route === "" ? 1 : 0.8,
    })),
  );
}
