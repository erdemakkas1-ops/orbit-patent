import { notFound } from "next/navigation";
import Link from "next/link";
import { isLocale, messages } from "@/lib/i18n/messages";
import { patentProvider } from "@/lib/patents";
import { searchSchema } from "@/lib/patents/search-schema";
import { SearchForm } from "@/components/search/search-form";
import { PatentCard } from "@/components/patents/patent-card";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { hydratePatentReferences } from "@/lib/patents/providers/epo";
import { localizePatents } from "@/lib/ai/translation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: value } = await params;
  const locale = isLocale(value) ? value : "tr";
  const m = messages[locale];
  return buildMetadata(locale, {
    title: m.search,
    description: m.intro,
    path: `/${locale}/patents`,
  });
}
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = messages[locale];
  const raw = await searchParams;
  const parsed = searchSchema.safeParse(raw);
  const q = parsed.success ? parsed.data : searchSchema.parse({});
  const liveSearch = patentProvider.source === "epo";
  const effectiveQuery = liveSearch
    ? { ...q, status: undefined, sort: "relevance" as const, pageSize: 6 }
    : q;
  const rawResult = parsed.success
    ? await patentProvider.searchPatents(effectiveQuery).catch(() => null)
    : null;
  const result =
    rawResult && liveSearch
      ? {
          ...rawResult,
          patents: await localizePatents(
            await hydratePatentReferences(
              rawResult.patents,
              (id) => patentProvider.getPatentById(id),
              rawResult.pageSize,
              3,
            ),
            locale,
          ),
        }
      : rawResult;
  function pageUrl(page: number) {
    const s = new URLSearchParams();
    Object.entries(q).forEach(([k, v]) => {
      if (v !== undefined && !(liveSearch && (k === "status" || k === "sort")))
        s.set(k, String(v));
    });
    s.set("page", String(page));
    return `/${locale}/patents?${s}`;
  }
  return (
    <>
      <p className="eyebrow">ORBIT / {m.patentExplore}</p>
      <h1 className="my-5">{m.patentExplore}</h1>
      <SearchForm
        key={JSON.stringify(q)}
        locale={locale}
        query={q}
        live={liveSearch}
      />
      {!parsed.success ? (
        <p role="alert" className="notice">
          {m.invalid}
        </p>
      ) : !result ? (
        <p role="alert" className="notice">
          {m.searchUnavailable}
        </p>
      ) : (
        <>
          <p className="notice mb-7">
            {result.source === "mock" ? m.mock : m.live}
          </p>
          <p className="mb-5 text-sm muted">
            {result.total} {m.results}
          </p>
          {result.patents.length ? (
            <div className="grid-cards">
              {result.patents.map((p) => (
                <PatentCard key={p.id} patent={p} locale={locale} />
              ))}
            </div>
          ) : (
            <div className="panel">
              <h2>{m.empty}</h2>
              <p className="muted">{m.emptyHint}</p>
            </div>
          )}
          <nav
            aria-label={m.page}
            className="pager my-8 flex items-center justify-center gap-4 text-sm"
          >
            {q.page > 1 && <Link href={pageUrl(q.page - 1)}>{m.previous}</Link>}
            <span>
              {m.page} {q.page}
            </span>
            {q.page * result.pageSize < result.total && (
              <Link href={pageUrl(q.page + 1)}>{m.next}</Link>
            )}
          </nav>
        </>
      )}
    </>
  );
}
