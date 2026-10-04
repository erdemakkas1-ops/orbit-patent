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
import { localizePatentCards } from "@/lib/ai/translation";
import {
  HeroBlueprint,
  HeroBlueprintFrame,
} from "@/components/home/hero-blueprint";

async function FeaturedPatentCards({ locale }: { locale: Locale }) {
  const rawFeatured = patentProvider.getFeaturedPatents
    ? await patentProvider.getFeaturedPatents(3).catch(() => [])
    : [];
  const featured = await localizePatentCards(rawFeatured, locale);
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
  // "Discover ideas from the past. Build the projects of the future." — the
  // second sentence carries the colour accent.
  const [headlineLead, ...rest] = m.headline.split(/(?<=\.)\s+/);
  const headlineRest = rest.join(" ");
  return (
    <section className="py-8 md:py-14">
      <div className="hero-grid">
        <div>
          <p className="eyebrow">{m.eyebrow}</p>
          <h1 className="hero-title my-6 max-w-2xl">
            {headlineLead}{" "}
            <span className="hero-accent">{headlineRest}</span>
          </h1>
          <p className="hero-intro max-w-xl">{m.intro}</p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild>
              <Link href={`/${locale}/discover?year=likely-expired`}>
                {m.patentExplore}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/${locale}/ai-search`}>{m.aiSearch}</Link>
            </Button>
          </div>
          <ul className="hero-proof">
            {m.heroProof.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <Suspense fallback={<HeroBlueprintFrame locale={locale} />}>
          <HeroBlueprint locale={locale} />
        </Suspense>
      </div>
      <section className="steps mt-20" aria-labelledby="steps-title">
        <p className="eyebrow">{m.howItWorks}</p>
        <h2 id="steps-title" className="steps-title">
          {m.stepsTitle}
        </h2>
        <ol className="steps-list">
          <li className="step">
            <span className="step-number">01</span>
            <h3>{m.howDiscover}</h3>
            <p>{m.howDiscoverText}</p>
            <div className="step-preview" aria-hidden="true">
              <span className="specimen-status status-lapsed">
                {m.stepPreviewStatus}
              </span>
            </div>
            <Link
              className="step-link"
              href={`/${locale}/discover?year=likely-expired`}
            >
              {m.stepCtas.discover} →
            </Link>
          </li>
          <li className="step">
            <span className="step-number">02</span>
            <h3>{m.howUnderstand}</h3>
            <p>{m.howUnderstandText}</p>
            <div className="step-preview" aria-hidden="true">
              <span className="metric-chip">{m.claim} 1</span>
              <span className="metric-chip">{m.claim} 12</span>
              <span className="step-preview-note">{m.stepPreviewClaim}</span>
            </div>
            <Link className="step-link" href={`/${locale}/patents`}>
              {m.stepCtas.understand} →
            </Link>
          </li>
          <li className="step">
            <span className="step-number">03</span>
            <h3>{m.howDevelop}</h3>
            <p>{m.howDevelopText}</p>
            <div className="step-preview" aria-hidden="true">
              <span className="step-chip">
                {m.developDirections.cheaper.label}
              </span>
              <span className="step-chip step-chip-on">
                {m.developDirections.smarter.label}
              </span>
              <span className="step-chip">
                {m.developDirections["new-use"].label}
              </span>
            </div>
            <Link className="step-link" href={`/${locale}/ai-search`}>
              {m.stepCtas.develop} →
            </Link>
          </li>
        </ol>
      </section>
      <section className="mt-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="eyebrow">{m.discover}</p>
            <h2 className="!mb-2">{m.featuredExpiredTitle}</h2>
            <p className="muted !mb-0 text-sm">{m.featuredExpiredIntro}</p>
          </div>
          <Link
            className="card-action text-sm font-semibold"
            href={`/${locale}/discover?year=likely-expired`}
          >
            {m.featuredExpiredAll}
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
      <section className="what-it-is-not mt-16" aria-labelledby="not-title">
        <h2 id="not-title">{m.whatItIsNot}</h2>
        <ul>
          {m.whatItIsNotItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <Link
          className="card-action text-sm font-semibold"
          href={`/${locale}/legal/sources`}
        >
          {m.legalLinks.sources}
        </Link>
      </section>
    </section>
  );
}
