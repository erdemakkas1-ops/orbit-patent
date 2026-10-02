import type { PatentSearch } from "@/types/patent";
function clean(value: string, max = 80) {
  return value
    .normalize("NFKC")
    .replace(/[\r\n]/g, " ")
    .replace(/[^\p{L}\p{N}\s._/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
function cqlValue(value: string) {
  return `"${clean(value).replaceAll('"', "")}"`;
}
export function buildEpoQuery(query: PatentSearch): string {
  const clauses: string[] = [];
  if (query.q) clauses.push(`ta=${cqlValue(query.q)}`);
  const anyTerms = query.anyTerms?.map((term) => clean(term)).filter(Boolean);
  if (anyTerms?.length)
    clauses.push(
      `(${anyTerms.map((term) => `ta=${cqlValue(term)}`).join(" OR ")})`,
    );
  if (query.cpc) clauses.push(`cpc=${cqlValue(query.cpc.toUpperCase())}`);
  if (query.ipc) clauses.push(`ipc=${cqlValue(query.ipc.toUpperCase())}`);
  if (query.year) clauses.push(`publicationdate=${query.year}`);
  if (!query.year && query.yearRange?.from && query.yearRange.to)
    clauses.push(
      `publicationdate within "${query.yearRange.from}0101,${query.yearRange.to}1231"`,
    );
  else if (!query.year && query.yearRange?.from)
    clauses.push(`publicationdate>=${query.yearRange.from}0101`);
  else if (!query.year && query.yearRange?.to)
    clauses.push(`publicationdate<=${query.yearRange.to}1231`);
  return clauses.length ? clauses.join(" AND ") : "publicationdate>=19000101";
}
export function buildSearchParams(query: PatentSearch, pageSize: number) {
  const start = (query.page - 1) * pageSize + 1;
  return { q: buildEpoQuery(query), range: `${start}-${start + pageSize - 1}` };
}
