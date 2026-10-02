import { mockPatents } from "@/data/mock-patents";
import type {
  DiscoveryFilters,
  PatentSearch,
  SearchResult,
} from "@/types/patent";
import type { PatentProvider } from "./provider";
import { fold } from "../search-schema";
import {
  categorizePatent,
  featuredScore,
  isPatentIdentifier,
} from "../discovery";
export class MockPatentProvider implements PatentProvider {
  readonly source = "mock" as const;
  async searchPatents(q: PatentSearch): Promise<SearchResult> {
    const identifier =
      q.q && isPatentIdentifier(q.q)
        ? fold(q.q).replace(/[^a-z0-9]/g, "")
        : null;
    const terms = fold(q.q ?? "")
      .split(/\s+/)
      .filter(Boolean);
    const score = (p: (typeof mockPatents)[number]) =>
      terms.filter((t) =>
        fold(
          JSON.stringify([
            p.title,
            p.abstract,
            p.publicationNumber,
            p.cpc,
            p.ipc,
          ]),
        ).includes(t),
      ).length;
    const found = mockPatents.filter(
      (p) =>
        (!terms.length ||
          (identifier
            ? [p.publicationNumber, p.applicationNumber].some((value) =>
                fold(value)
                  .replace(/[^a-z0-9]/g, "")
                  .includes(identifier),
              )
            : score(p) > 0)) &&
        (!q.cpc || p.cpc.some((c) => c.startsWith(q.cpc!.toUpperCase()))) &&
        (!q.ipc || p.ipc.some((c) => c.startsWith(q.ipc!.toUpperCase()))) &&
        (!q.year || p.publicationDate.startsWith(String(q.year))) &&
        (!q.status || p.legalStatus === q.status),
    );
    found.sort((a, b) =>
      q.sort === "relevance"
        ? score(b) - score(a)
        : q.sort === "oldest"
          ? a.publicationDate.localeCompare(b.publicationDate)
          : b.publicationDate.localeCompare(a.publicationDate),
    );
    return {
      patents: found.slice((q.page - 1) * 9, q.page * 9),
      total: found.length,
      page: q.page,
      pageSize: 9,
      source: this.source,
    };
  }
  async discoverPatents(filters: DiscoveryFilters): Promise<SearchResult> {
    const found = mockPatents.filter((patent) => {
      const year = Number(patent.publicationDate.slice(0, 4));
      return (
        (!filters.category || categorizePatent(patent) === filters.category) &&
        (!filters.legalStatus || patent.legalStatus === filters.legalStatus) &&
        (!filters.yearRange?.from || year >= filters.yearRange.from) &&
        (!filters.yearRange?.to || year <= filters.yearRange.to)
      );
    });
    found.sort((a, b) => {
      if (filters.sort === "oldest")
        return a.publicationDate.localeCompare(b.publicationDate);
      if (filters.sort === "newest")
        return b.publicationDate.localeCompare(a.publicationDate);
      return featuredScore(b) - featuredScore(a) || a.id.localeCompare(b.id);
    });
    const start = (filters.page - 1) * filters.pageSize;
    return {
      patents: found.slice(start, start + filters.pageSize),
      total: found.length,
      page: filters.page,
      pageSize: filters.pageSize,
      source: this.source,
    };
  }
  async getFeaturedPatents(limit = 6) {
    return [...mockPatents]
      .sort(
        (a, b) =>
          featuredScore(b) - featuredScore(a) || a.id.localeCompare(b.id),
      )
      .slice(0, Math.max(0, limit));
  }
  async getPatentById(id: string) {
    return mockPatents.find((p) => p.id === id) ?? null;
  }
  async getPatentFamily(id: string) {
    return (await this.getPatentById(id))?.family ?? [];
  }
  async getLegalEvents(id: string) {
    return (await this.getPatentById(id))?.legalEvents ?? [];
  }
}
