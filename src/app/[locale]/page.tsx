import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Locale } from "@/types/patent";
import { messages, isLocale } from "@/lib/i18n/messages";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { patentProvider } from "@/lib/patents";
import { DiscoverCard } from "@/components/patents/discover-card";
import { discoveryCategories } from "@/lib/patents/discovery";
import { localizePatents } from "@/lib/ai/translation";

async function FeaturedPatentCards({ locale }: { locale: Locale }) {
  const rawFeatured = patentProvider.getFeaturedPatents
    ? await patentProvider.getFeaturedPatents(3).catch(() => [])
    : [];
  const featured = await localizePatents(rawFeatured, locale);
  if (!featured.length) return null;
  return (
    <div className="grid-cards">
      {featured.map((patent) => (
        <DiscoverCard
          key={patent.id}
          patent={patent}
          locale={locale}
          featured
        />
      ))}
    </div>
  );
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = messages[locale];
  return (
    <section className="py-8 md:py-14">
      <div className="hero-grid">
        <div>
          <p className="eyebrow">{m.eyebrow}</p>
          <p className="brand-link mt-3 text-sm font-medium">
            {m.publicPlatform}
          </p>
          <h1 className="hero-title my-6 max-w-2xl">{m.headline}</h1>
          <p className="muted max-w-xl text-lg">{m.intro}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild>
              <Link href={`/${locale}/discover`}>{m.patentExplore}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/${locale}/patents`}>{m.search}</Link>
            </Button>
            <Link
              className="card-action self-center px-2 text-sm font-semibold"
              href={`/${locale}/ai-search`}
            >
              {m.aiSearch}
            </Link>
          </div>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <span className="orbit-node" style={{ top: "24%", left: "28%" }} />
          <span className="orbit-node" style={{ top: "62%", left: "68%" }} />
          <span className="orbit-node" style={{ top: "72%", left: "22%" }} />
        </div>
      </div>
      <div className="feature-row mt-16">
        {[
          [m.discover, m.featureDiscoveryText],
          [m.search, m.featureSearchText],
          [m.aiSearch, m.featureMatchingText],
        ].map(([title, text], i) => (
          <div key={title}>
            <p className="eyebrow mb-3">0{i + 1}</p>
            <h3 className="mb-2">{title}</h3>
            <p className="muted text-sm">{text}</p>
          </div>
        ))}
      </div>
      <section
        className="how-it-works mt-16"
        aria-labelledby="how-it-works-title"
      >
        <p className="eyebrow">ORBIT / {m.howItWorks}</p>
        <h2 id="how-it-works-title" className="mt-2">
          {m.howItWorks}
        </h2>
        <div className="how-steps">
          {[
            [m.howDiscover, m.howDiscoverText],
            [m.howUnderstand, m.howUnderstandText],
            [m.howDevelop, m.howDevelopText],
          ].map(([title, text], index) => (
            <div className="how-step" key={title}>
              <span className="how-step-number">0{index + 1}</span>
              <h3>{title}</h3>
              <p className="muted text-sm">{text}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{m.discover}</p>
            <h2 className="!mb-0">{m.featuredPatents}</h2>
          </div>
          <Link
            className="card-action text-sm font-semibold"
            href={`/${locale}/discover`}
          >
            {m.exploreAll}
          </Link>
        </div>
        <Suspense
          fallback={
            <div className="grid-cards" aria-hidden="true">
              <Skeleton className="aspect-[9/10] w-full" />
              <Skeleton className="aspect-[9/10] w-full" />
              <Skeleton className="aspect-[9/10] w-full" />
            </div>
          }
        >
          <FeaturedPatentCards locale={locale} />
        </Suspense>
        <div className="mt-6 flex flex-wrap gap-2">
          {discoveryCategories.slice(0, 5).map((category) => (
            <Link
              key={category}
              className="discovery-filter"
              href={`/${locale}/discover?category=${category}`}
            >
              {m.discoveryCategories[category]}
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}
