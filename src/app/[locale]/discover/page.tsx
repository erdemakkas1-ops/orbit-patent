import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  LegalStatus,
  type DiscoveryFilters,
  type Locale,
} from "@/types/patent";
import { isLocale, messages } from "@/lib/i18n/messages";
import { patentProvider } from "@/lib/patents";
import {
  discoveryCategories,
  discoveryFiltersFor,
  discoveryQuerySchema,
} from "@/lib/patents/discovery";
import { DiscoverCard } from "@/components/patents/discover-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterLink } from "@/components/discover/filter-link";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { localizePatentCards } from "@/lib/ai/translation";

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
  const liveDiscovery = patentProvider.source === "epo";
  const filters = discoveryFiltersFor(query, liveDiscovery);
  const legalStatus = filters.legalStatus;
  const hasFilters = Boolean(
    query.category || legalStatus || query.year || query.sort !== "featured",
  );
  const url = (changes: Record<string, string | number | undefined>) => {
    const values: Record<string, string | number | undefined> = {
      ...query,
      ...changes,
    };
    if (liveDiscovery) values.status = undefined;
    if (liveDiscovery) values.sort = undefined;
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
    <FilterLink
      key={`${href}-${label}`}
      href={href}
      aria-current={active ? "page" : undefined}
      className={`discovery-filter ${active ? "discovery-filter-active" : ""}`}
    >
      {label}
    </FilterLink>
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
          {liveDiscovery ? (
            <>
              <div className="flex flex-wrap gap-2">
                {filterLink(
                  url({
                    year:
                      query.year === "likely-expired"
                        ? undefined
                        : "likely-expired",
                    page: 1,
                  }),
                  query.year === "likely-expired",
                  m.likelyExpiredFilter,
                )}
              </div>
              <p className="muted mt-3 text-sm">{m.likelyExpiredNote}</p>
            </>
          ) : (
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
          )}
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
        {liveDiscovery ? (
          <p className="notice text-sm">{m.liveSortUnavailable}</p>
        ) : (
          <form action={`/${locale}/discover`} className="flex items-end gap-3">
            {query.category && (
              <input type="hidden" name="category" value={query.category} />
            )}
            {legalStatus && (
              <input type="hidden" name="status" value={legalStatus} />
            )}
            {query.year && (
              <input type="hidden" name="year" value={query.year} />
            )}
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
        )}
      </div>

      {!parsed.success ? (
        <p role="alert" className="notice">
          {m.invalid}
        </p>
      ) : (
        <div className="discover-results">
          <Suspense
            key={JSON.stringify(filters)}
            fallback={<ResultsLoading />}
          >
            <DiscoverResults
              filters={filters}
              locale={locale}
              page={query.page}
              pageUrl={(page) => url({ page })}
            />
          </Suspense>
        </div>
      )}
    </>
  );
}

function ResultsLoading() {
  return (
    <div className="grid-cards" aria-busy="true">
      {[1, 2, 3, 4, 5, 6].map((item) => (
        <Skeleton key={item} className="h-[28rem]" />
      ))}
    </div>
  );
}

/**
 * Results stream in on their own: the heading and filters render at once,
 * so a cold filter (EPO search, record lookups, card translation) shows a
 * skeleton in place instead of holding the whole page.
 */
async function DiscoverResults({
  filters,
  locale,
  page,
  pageUrl,
}: {
  filters: DiscoveryFilters;
  locale: Locale;
  page: number;
  pageUrl: (page: number) => string;
}) {
  const m = messages[locale];
  const rawResult = patentProvider.discoverPatents
    ? await patentProvider.discoverPatents(filters).catch(() => null)
    : null;
  const result = rawResult
    ? {
        ...rawResult,
        patents: await localizePatentCards(rawResult.patents, locale),
      }
    : null;
  return !result ? (
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
        className="pager my-8 flex items-center justify-center gap-4 text-sm"
      >
        {page > 1 && (
          <FilterLink href={pageUrl(page - 1)}>{m.previous}</FilterLink>
        )}
        <span>
          {m.page} {page}
        </span>
        {page * result.pageSize < result.total && (
          <FilterLink href={pageUrl(page + 1)}>{m.next}</FilterLink>
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
  );
}
