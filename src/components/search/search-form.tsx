import type { Locale, PatentSearch } from "@/types/patent";
import { LegalStatus } from "@/types/patent";
import { messages } from "@/lib/i18n/messages";
import { Button } from "@/components/ui/button";
import Link from "next/link";
export function SearchForm({
  locale,
  query: q,
  live = false,
}: {
  locale: Locale;
  query: PatentSearch;
  live?: boolean;
}) {
  const m = messages[locale];
  return (
    <form action={`/${locale}/patents`} className="search-hero mb-8">
      <div className="filter-bar">
        <label>
          {m.query}
          <input
            name="q"
            placeholder={m.queryPlaceholder}
            defaultValue={q.q}
            maxLength={160}
          />
        </label>
        {live ? (
          <p className="notice text-sm">{m.liveStatusUnavailable}</p>
        ) : (
          <label>
            {m.status}
            <select name="status" defaultValue={q.status ?? ""}>
              <option value="">{m.all}</option>
              {Object.values(LegalStatus).map((s) => (
                <option key={s} value={s}>
                  {m.statuses[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {m.cpc}
          <input name="cpc" defaultValue={q.cpc} maxLength={160} />
        </label>
        <label>
          {m.ipc}
          <input name="ipc" defaultValue={q.ipc} maxLength={160} />
        </label>
        <label>
          {m.year}
          <input
            name="year"
            type="number"
            min={1800}
            max={2100}
            defaultValue={q.year}
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        {live ? (
          <p className="notice text-sm">{m.liveSortUnavailable}</p>
        ) : (
          <label className="min-w-36">
            {m.sort}
            <select name="sort" defaultValue={q.sort}>
              <option value="relevance">{m.relevance}</option>
              <option value="newest">{m.newest}</option>
              <option value="oldest">{m.oldest}</option>
            </select>
          </label>
        )}
        <Button type="submit">{m.search}</Button>
        <Link
          className="py-2 text-sm muted underline"
          href={`/${locale}/patents`}
        >
          {m.clear}
        </Link>
      </div>
    </form>
  );
}
