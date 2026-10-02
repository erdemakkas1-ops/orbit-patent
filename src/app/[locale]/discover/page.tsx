import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalStatus, type DiscoveryFilters } from "@/types/patent";
import { isLocale, messages } from "@/lib/i18n/messages";
import { patentProvider } from "@/lib/patents";
import {
  discoveryCategories,
  discoveryQuerySchema,
  yearRanges,
} from "@/lib/patents/discovery";
import { DiscoverCard } from "@/components/patents/discover-card";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: value } = await params;
  const locale = isLocale(value) ? value : "tr";
  const m = messages[locale];
  return buildMetadata(locale, {
    title: m.patentExplore,
    description: m.discoverIntro,
    path: `/${locale}/discover`,
  });
}

export default async function DiscoverPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = messages[locale];
  const parsed = discoveryQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : discoveryQuerySchema.parse({});
  const filters: DiscoveryFilters = {
    category: query.category,
    legalStatus: query.status,
    yearRange: query.year ? yearRanges[query.year] : undefined,
    sort: query.sort,
    page: query.page,
    pageSize: 20,
  };
  const result =
    parsed.success && patentProvider.discoverPatents
      ? await patentProvider.discoverPatents(filters).catch(() => null)
      : null;
  const hasFilters = Boolean(
    query.category || query.status || query.year || query.sort !== "featured",
  );
  const url = (changes: Record<string, string | number | undefined>) => {
    const values: Record<string, string | number | undefined> = {
      ...query,
      ...changes,
    };
    const params = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      if (
        value !== undefined &&
        value !== "" &&
        !(key === "sort" && value === "featured") &&
        !(key === "page" && value === 1)
      )
        params.set(key, String(value));
    });
    const suffix = params.toString();
    return `/${locale}/discover${suffix ? `?${suffix}` : ""}`;
  };
  const filterLink = (href: string, active: boolean, label: string) => (
    <Link
      key={`${href}-${label}`}
      href={href}
      aria-current={active ? "page" : undefined}
      className={`discovery-filter ${active ? "discovery-filter-active" : ""}`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <p className="eyebrow">ORBIT / {m.discover}</p>
      <h1 className="my-5">{m.patentExplore}</h1>
      <p className="muted mb-9 max-w-2xl text-lg">{m.discoverIntro}</p>

      <section
        className="discovery-controls"
        aria-label={m.discoverByTechnology}
      >
        <div>
          <h2>{m.discoverByTechnology}</h2>
          <div className="discovery-filter-grid">
            {discoveryCategories.map((category) =>
              filterLink(
                url({
                  category: query.category === category ? undefined : category,
                  page: 1,
                }),
                query.category === category,
                m.discoveryCategories[category],
              ),
            )}
          </div>
        </div>
        <div>
          <h2>{m.discoverByStatus}</h2>
          <div className="flex flex-wrap gap-2">
            {Object.values(LegalStatus).map((status) =>
              filterLink(
                url({
                  status: query.status === status ? undefined : status,
                  page: 1,
                }),
                query.status === status,
                m.statuses[status],
              ),
            )}
          </div>
        </div>
        <div>
          <h2>{m.discoverByYear}</h2>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["before-2000", m.before2000],
                ["2000-2009", m.years2000],
                ["2010-2019", m.years2010],
                ["2020-present", m.years2020],
              ] as const
            ).map(([year, label]) =>
              filterLink(
                url({ year: query.year === year ? undefined : year, page: 1 }),
                query.year === year,
                label,
              ),
            )}
          </div>
        </div>
      </section>

      <div className="my-8 flex flex-wrap items-end justify-between gap-4">
        <h2 className="!mb-0">
          {hasFilters ? m.discoveryResults : m.featuredPatents}
        </h2>
        <form action={`/${locale}/discover`} className="flex items-end gap-3">
          {query.category && (
            <input type="hidden" name="category" value={query.category} />
          )}
          {query.status && (
            <input type="hidden" name="status" value={query.status} />
          )}
          {query.year && <input type="hidden" name="year" value={query.year} />}
          <label className="min-w-40">
            {m.sort}
            <select name="sort" defaultValue={query.sort}>
              <option value="featured">{m.featured}</option>
              <option value="newest">{m.newest}</option>
              <option value="oldest">{m.oldest}</option>
            </select>
          </label>
          <Button type="submit" size="sm">
            {m.sort}
          </Button>
        </form>
      </div>

      {!parsed.success ? (
        <p role="alert" className="notice">
          {m.invalid}
        </p>
      ) : !result ? (
        <p role="alert" className="notice">
          {m.discoveryUnavailable}
        </p>
      ) : result.patents.length ? (
        <>
          <div className="grid-cards">
            {result.patents.map((patent) => (
              <DiscoverCard key={patent.id} patent={patent} locale={locale} />
            ))}
          </div>
          <nav
            aria-label={m.page}
            className="my-8 flex items-center justify-center gap-6 text-sm"
          >
            {query.page > 1 && (
              <Link href={url({ page: query.page - 1 })}>{m.previous}</Link>
            )}
            <span>
              {m.page} {query.page}
            </span>
            {query.page * result.pageSize < result.total && (
              <Link href={url({ page: query.page + 1 })}>{m.next}</Link>
            )}
          </nav>
        </>
      ) : (
        <div className="panel text-center">
          <h2>{m.discoveryEmpty}</h2>
          <Button asChild variant="outline">
            <Link href={`/${locale}/discover`}>{m.clear}</Link>
          </Button>
        </div>
      )}
    </>
  );
}
