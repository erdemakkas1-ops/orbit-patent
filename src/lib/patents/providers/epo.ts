import type { PatentProvider } from "./provider";
import { durableGet, durableSet } from "@/lib/durable-cache";
import type {
  Patent,
  PatentSearch,
  SearchResult,
  LegalEvent,
  DiscoveryFilters,
  PatentClaims,
} from "@/types/patent";
import { EPO_CONFIG } from "./epo/config";
import { EpoAuth } from "./epo/auth";
import { buildSearchParams } from "./epo/query";
import { parseEpoBiblio, parseEpoSearch } from "./epo/parser";
import { stableCacheKey } from "@/lib/cache-key";
import {
  parsePatentIdentifier,
  toDocdbIdentifier,
  toEpodocIdentifier,
  toRouteIdentifier,
} from "./epo/identifier";
import { EpoImageService } from "./epo/images";
import {
  discoverySearchTerms,
  featuredScore,
  yearRanges,
} from "@/lib/patents/discovery";
import { parseEpoFamilyLegal } from "./epo/family";
import { parseEpoClaims } from "./epo/claims";
import { resolvePatentLegalStatus } from "@/lib/patents/legal-status/resolve";

export type EpoResponseMetadata = {
  path: string;
  status: number;
  contentType: string;
  durationMs: number;
  safeErrorSummary?: string;
};

function logEpoError(metadata: EpoResponseMetadata) {
  console.error(
    "[EPO OPS ERROR]",
    JSON.stringify({
      path: metadata.path,
      status: metadata.status,
      durationMs: metadata.durationMs,
      contentType: metadata.contentType,
      ...(metadata.safeErrorSummary
        ? { safeErrorSummary: metadata.safeErrorSummary }
        : {}),
    }),
  );
}

function logEpoMiss(metadata: EpoResponseMetadata) {
  console.info(
    "[EPO OPS MISS]",
    JSON.stringify({
      path: metadata.path,
      status: metadata.status,
      durationMs: metadata.durationMs,
      contentType: metadata.contentType,
    }),
  );
}

export class EpoOpsHttpError extends Error {
  constructor(
    readonly status: number,
    readonly safeSummary: string,
  ) {
    super("EPO_UPSTREAM_UNAVAILABLE");
  }
}

const isEpoNotFound = (error: unknown) =>
  error instanceof EpoOpsHttpError && error.status === 404;

function safeUpstreamSummary(body: string) {
  const read = (name: string) =>
    body
      .match(new RegExp(`<${name}[^>]*>([^<]{1,160})</${name}>`, "i"))?.[1]
      ?.replace(/\s+/g, " ")
      .trim();
  return (
    [read("code"), read("message")].filter(Boolean).join(": ").slice(0, 240) ||
    "upstream rejected request"
  );
}

export class EpoOpsClient {
  readonly auth: EpoAuth;
  constructor(key: string, secret: string) {
    this.auth = new EpoAuth(key, secret);
  }
  private async fetchAuthorized(
    path: string,
    accept: string,
    params?: Record<string, string>,
    range?: string,
  ) {
    if (!/^(published-data|family)\/[a-z0-9.,/_-]+$/i.test(path))
      throw new Error("EPO_INVALID_PATH");
    const url = new URL(`${EPO_CONFIG.baseUrl}/${path}`);
    Object.entries(params ?? {}).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );
    const headers = async () => ({
      Authorization: `Bearer ${await this.auth.getToken()}`,
      Accept: accept,
      ...(range ? { Range: range } : {}),
    });
    const started = Date.now();
    let response = await fetch(url, {
      headers: await headers(),
      signal: AbortSignal.timeout(EPO_CONFIG.timeoutMs),
      cache: "no-store",
    });
    if (response.status === 401) {
      this.auth.invalidate();
      response = await fetch(url, {
        headers: await headers(),
        signal: AbortSignal.timeout(EPO_CONFIG.timeoutMs),
        cache: "no-store",
      });
    }
    return { response, durationMs: Date.now() - started };
  }
  async request(
    path: string,
    params?: Record<string, string>,
    range?: string,
    observe?: (metadata: EpoResponseMetadata) => void,
  ) {
    const started = Date.now();
    let response: Response;
    let durationMs: number;
    try {
      ({ response, durationMs } = await this.fetchAuthorized(
        path,
        "application/exchange+xml",
        params,
        range,
      ));
    } catch (error) {
      logEpoError({
        path,
        status: 0,
        contentType: "",
        durationMs: Date.now() - started,
        safeErrorSummary:
          error instanceof Error ? error.message : "network error",
      });
      throw error;
    }
    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();
    const safeErrorSummary = response.ok
      ? undefined
      : safeUpstreamSummary(body);
    observe?.({
      path,
      status: response.status,
      contentType,
      durationMs,
      safeErrorSummary,
    });
    if (!response.ok) {
      const metadata = {
        path,
        status: response.status,
        contentType,
        durationMs,
        safeErrorSummary,
      };
      if (response.status === 404) logEpoMiss(metadata);
      else logEpoError(metadata);
    }
    if (!response.ok)
      throw new EpoOpsHttpError(
        response.status,
        safeErrorSummary ?? "upstream rejected request",
      );
    if (!/xml/i.test(contentType))
      throw new Error("EPO_UPSTREAM_INVALID_CONTENT");
    if (
      process.env.NODE_ENV === "development" &&
      path === "published-data/search"
    ) {
      const parsed = parseEpoSearch(body);
      const [rangeBegin, rangeEnd] = (range ?? "").split("-").map(Number);
      console.info(
        "[EPO OPS search]",
        JSON.stringify({
          cql: params?.q ?? "",
          status: response.status,
          totalResultCount: parsed.total,
          rangeBegin,
          rangeEnd,
          opsPublicationReferences: parsed.diagnostics.opsPublicationReferences,
          exchPublicationReferences:
            parsed.diagnostics.exchPublicationReferences,
          exchangeDocuments: parsed.diagnostics.exchangeDocuments,
          normalizedPatents: parsed.patents.length,
        }),
      );
    }
    return body;
  }
  async requestBinary(path: string, accept: string, range: string) {
    const { response } = await this.fetchAuthorized(
      path,
      accept,
      undefined,
      range,
    );
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok) {
      const summary = safeUpstreamSummary(await response.text());
      throw new EpoOpsHttpError(response.status, summary);
    }
    return {
      body: new Uint8Array(await response.arrayBuffer()),
      contentType,
    };
  }
}
type CacheEntry<T> = { expires: number; value: T };

// Parallel detail lookups while filling a page; well within OPS fair use.
export const EPO_DISCOVERY_CONCURRENCY = 6;
/**
 * Curated surfaces (discover, featured) stay on granting offices with English
 * bibliographic data, legal events and good drawings. WO is left out: an
 * international application never becomes a patent with a register status.
 */
export const DISCOVERY_OFFICES = ["US", "EP", "GB"] as const;

function hasBibliographicData(patent: Patent) {
  const publication = patent.publicationNumber.replace(/\s/g, "").toUpperCase();
  const hasTitle = Object.values(patent.title).some((value) => {
    const normalized = value.replace(/\s/g, "").toUpperCase();
    return Boolean(normalized && normalized !== publication);
  });
  return Boolean(
    hasTitle ||
    patent.abstract.tr ||
    patent.abstract.en ||
    patent.publicationDate ||
    patent.applicationNumber ||
    patent.applicants.length ||
    patent.inventors.length ||
    patent.cpc.length ||
    patent.ipc.length,
  );
}

const inventionKey = (patent: Patent) =>
  [
    (patent.title.en || patent.title.tr).toLowerCase().replace(/\W+/g, " ").trim(),
    (patent.applicants[0] ?? "").toLowerCase().replace(/\W+/g, " ").trim(),
  ].join("|");

export async function hydratePatentReferences(
  references: Patent[],
  hydrate: (id: string) => Promise<Patent | null>,
  limit: number,
  concurrency = EPO_DISCOVERY_CONCURRENCY,
) {
  const safeLimit = Math.max(0, limit);
  const batchSize = Math.min(
    EPO_DISCOVERY_CONCURRENCY,
    Math.max(1, concurrency),
  );
  const unique = [
    ...new Map(
      references.map((patent) => [
        patent.publicationNumber.replace(/\s/g, "").toUpperCase(),
        patent,
      ]),
    ).values(),
  ];
  const hydrated: Patent[] = [];
  const inventions = new Set<string>();
  for (let index = 0; index < unique.length && hydrated.length < safeLimit;) {
    const batch = unique.slice(index, index + batchSize);
    index += batch.length;
    const settled = await Promise.allSettled(
      batch.map((patent) => hydrate(patent.id)),
    );
    for (const result of settled) {
      if (
        result.status === "fulfilled" &&
        result.value &&
        hasBibliographicData(result.value)
      ) {
        // Divisionals and sibling filings repeat the same invention under
        // another number; one card per invention is enough.
        const invention = inventionKey(result.value);
        if (inventions.has(invention)) continue;
        inventions.add(invention);
        hydrated.push(result.value);
      }
      if (hydrated.length === safeLimit) break;
    }
  }
  return hydrated;
}

export class EpoOpsPatentProvider implements PatentProvider {
  readonly source = "epo" as const;
  private readonly searchCache = new Map<string, CacheEntry<SearchResult>>();
  private readonly discoveryCache = new Map<string, CacheEntry<SearchResult>>();
  private readonly detailCache = new Map<string, CacheEntry<Patent | null>>();
  private readonly familyCache = new Map<
    string,
    CacheEntry<Promise<{ family: Patent["family"]; legalEvents: LegalEvent[] }>>
  >();
  private featuredCache?: CacheEntry<Patent[]>;
  private readonly images: EpoImageService;
  constructor(readonly client: EpoOpsClient) {
    this.images = new EpoImageService(client);
  }
  async searchPatents(query: PatentSearch): Promise<SearchResult> {
    const key = stableCacheKey("epo-search", query);
    const cached = this.searchCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    const pageSize = Math.max(
      1,
      Math.min(EPO_CONFIG.pageSize, query.pageSize ?? EPO_CONFIG.pageSize),
    );
    const { q, range } = buildSearchParams(query, pageSize);
    let xml: string | undefined;
    try {
      xml = await this.client.request("published-data/search", { q }, range);
    } catch (error) {
      // OPS answers an empty search with 404 "No results found"; that is a result, not an outage.
      if (!isEpoNotFound(error)) throw error;
    }
    const parsed = xml ? parseEpoSearch(xml) : { patents: [], total: 0 };
    const result = {
      patents: parsed.patents,
      total: parsed.total,
      page: query.page,
      pageSize,
      source: "epo" as const,
    };
    this.searchCache.set(key, {
      value: result,
      expires: Date.now() + EPO_CONFIG.searchCacheMs,
    });
    return result;
  }
  async discoverPatents(
    filters: DiscoveryFilters,
    { refresh = false }: { refresh?: boolean } = {},
  ): Promise<SearchResult> {
    if (filters.legalStatus)
      throw new Error("EPO_LEGAL_STATUS_FILTER_UNAVAILABLE");
    const key = stableCacheKey("epo-discovery", filters);
    const cached = this.discoveryCache.get(key);
    if (!refresh && cached && cached.expires > Date.now()) return cached.value;
    const stored = refresh ? undefined : await durableGet<SearchResult>(key);
    if (stored) {
      this.discoveryCache.set(key, {
        value: stored,
        expires: Date.now() + EPO_CONFIG.searchCacheMs,
      });
      return stored;
    }
    const references = await this.searchPatents({
      offices: DISCOVERY_OFFICES,
      anyTerms: filters.category
        ? discoverySearchTerms[filters.category]
        : Object.values(discoverySearchTerms).flat(),
      yearRange: filters.yearRange,
      sort: filters.sort === "featured" ? "relevance" : filters.sort,
      page: filters.page,
      // Small offices often have no bibliographic record to hydrate; draw a
      // double pool so a page still fills up with real cards.
      pageSize: Math.min(EPO_CONFIG.pageSize, filters.pageSize * 2),
    });
    const patents = await hydratePatentReferences(
      references.patents,
      (id) => this.getPatentById(id),
      filters.pageSize,
    );
    patents.sort((a, b) => {
      if (filters.sort === "featured")
        return featuredScore(b) - featuredScore(a) || a.id.localeCompare(b.id);
      const direction = filters.sort === "oldest" ? 1 : -1;
      return (
        direction * a.publicationDate.localeCompare(b.publicationDate) ||
        a.id.localeCompare(b.id)
      );
    });
    const result = {
      ...references,
      patents,
      pageSize: filters.pageSize,
    };
    this.discoveryCache.set(key, {
      value: result,
      expires: Date.now() + EPO_CONFIG.searchCacheMs,
    });
    // A full page is shared across instances; a short one may be a hiccup.
    if (patents.length === filters.pageSize)
      void durableSet(key, result, EPO_CONFIG.durableDiscoveryCacheMs);
    return result;
  }
  async getFeaturedPatents(limit = 6): Promise<Patent[]> {
    const safeLimit = Math.max(0, Math.min(6, limit));
    if (!safeLimit) return [];
    const cached = this.featuredCache;
    if (cached && cached.expires > Date.now())
      return cached.value.slice(0, safeLimit);
    // A wider pool so cards with a known register status can lead.
    const candidateLimit = Math.min(12, Math.max(safeLimit, safeLimit * 4));
    const result = await this.searchPatents({
      offices: DISCOVERY_OFFICES,
      // The homepage promise: ideas whose protection has ended.
      yearRange: yearRanges["likely-expired"],
      anyTerms: [
        ...discoverySearchTerms.robotics,
        ...discoverySearchTerms.sensors,
        ...discoverySearchTerms.energy,
      ],
      sort: "relevance",
      page: 1,
      pageSize: candidateLimit,
    });
    const featured = await hydratePatentReferences(
      result.patents,
      (id) => this.getPatentById(id),
      candidateLimit,
    );
    featured.sort(
      (a, b) => featuredScore(b) - featuredScore(a) || a.id.localeCompare(b.id),
    );
    this.featuredCache = {
      value: featured,
      expires: Date.now() + EPO_CONFIG.searchCacheMs,
    };
    return featured.slice(0, safeLimit);
  }
  async getPatentById(id: string): Promise<Patent | null> {
    const identifier = parsePatentIdentifier(id);
    if (!identifier) throw new Error("EPO_INVALID_IDENTIFIER");
    const normalizedId = toRouteIdentifier(identifier);
    const cached = this.detailCache.get(normalizedId);
    if (cached && cached.expires > Date.now()) return cached.value;
    const durableKey = `epo-detail:${normalizedId}`;
    const stored = await durableGet<Patent>(durableKey);
    if (stored) {
      this.detailCache.set(normalizedId, {
        value: stored,
        expires: Date.now() + EPO_CONFIG.detailCacheMs,
      });
      return stored;
    }
    const request = async (format: "EPODOC" | "DOCDB", path: string) =>
      this.client.request(path, undefined, undefined, (metadata) => {
        if (process.env.NODE_ENV !== "development") return;
        console.info(
          "[EPO OPS detail]",
          JSON.stringify({
            inputPatentId: id,
            normalizedIdentifier: normalizedId,
            identifierFormat: format,
            path,
            status: metadata.status,
            contentType: metadata.contentType,
            durationMs: metadata.durationMs,
            ...(metadata.safeErrorSummary
              ? { errorSummary: metadata.safeErrorSummary }
              : {}),
          }),
        );
      });
    const epodocPath = `published-data/publication/epodoc/${toEpodocIdentifier(identifier)}/biblio`;
    let xml: string;
    try {
      xml = await request("EPODOC", epodocPath);
    } catch (error) {
      const docdb = toDocdbIdentifier(identifier);
      if (
        !(error instanceof EpoOpsHttpError) ||
        ![400, 404].includes(error.status)
      )
        throw error;
      // Both lookups refused the number (400 malformed / 404 unknown): no such patent.
      if (!docdb) return null;
      try {
        xml = await request(
          "DOCDB",
          `published-data/publication/docdb/${docdb}/biblio`,
        );
      } catch (docdbError) {
        if (
          docdbError instanceof EpoOpsHttpError &&
          [400, 404].includes(docdbError.status)
        )
          return null;
        throw docdbError;
      }
    }
    const patent = parseEpoBiblio(xml);
    if (patent) {
      const [drawings, familyLegal] = await Promise.allSettled([
        this.images.getDrawings(patent.publicationNumber || normalizedId),
        this.getFamilyMetadata(normalizedId),
      ]);
      if (drawings.status === "fulfilled") {
        patent.drawings = drawings.value;
        patent.drawingStatus = patent.drawings.length ? "available" : "none";
      } else {
        patent.drawings = [];
        patent.drawingStatus = "unavailable";
      }
      if (familyLegal.status === "fulfilled") {
        // Status is national: only this publication's own office counts.
        const country = patent.publicationNumber.slice(0, 2).toUpperCase();
        patent.legalEvents = familyLegal.value.legalEvents.filter(
          (event) => event.jurisdiction === country,
        );
        patent.legalStatus = resolvePatentLegalStatus(
          patent.legalEvents,
          country,
        );
        if (!patent.family.length) patent.family = familyLegal.value.family;
      }
    }
    this.detailCache.set(normalizedId, {
      value: patent,
      expires: Date.now() + EPO_CONFIG.detailCacheMs,
    });
    // Share complete records only: a transient drawing failure must not stick.
    if (patent && patent.drawingStatus !== "unavailable")
      void durableSet(durableKey, patent, EPO_CONFIG.durableDetailCacheMs);
    return patent;
  }
  getPatentDrawings(id: string) {
    return this.images.getDrawings(id);
  }
  getPatentDrawingPage(id: string, page: number, variant?: "full" | "card") {
    return this.images.getDrawingPage(id, page, variant);
  }
  private getFamilyMetadata(id: string) {
    const identifier = parsePatentIdentifier(id);
    if (!identifier) return Promise.reject(new Error("EPO_INVALID_IDENTIFIER"));
    const key = toRouteIdentifier(identifier);
    const cached = this.familyCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    const docdb = toDocdbIdentifier(identifier);
    if (!docdb) return Promise.resolve({ family: [], legalEvents: [] });
    const durableKey = `epo-family:${key}`;
    const value = durableGet<ReturnType<typeof parseEpoFamilyLegal>>(
      durableKey,
    ).then(
      (stored) =>
        stored ??
        this.client
          .request(`family/publication/docdb/${docdb}/biblio,legal`)
          .then(parseEpoFamilyLegal)
          .then((parsed) => {
            void durableSet(
              durableKey,
              parsed,
              EPO_CONFIG.durableDetailCacheMs,
            );
            return parsed;
          })
          .catch(() => ({ family: [], legalEvents: [] })),
    );
    this.familyCache.set(key, {
      value,
      expires: Date.now() + EPO_CONFIG.detailCacheMs,
    });
    return value;
  }
  async getPatentClaims(id: string): Promise<PatentClaims | null> {
    const identifier = parsePatentIdentifier(id);
    if (!identifier) throw new Error("EPO_INVALID_IDENTIFIER");
    const key = `epo-claims:${toRouteIdentifier(identifier)}`;
    // Wrapped so "this office has no full text" is cached too.
    const stored = await durableGet<{ claims: PatentClaims | null }>(key);
    if (stored) return stored.claims;
    let claims: PatentClaims | null = null;
    try {
      claims = parseEpoClaims(
        await this.client.request(
          `published-data/publication/epodoc/${toEpodocIdentifier(identifier)}/claims`,
        ),
      );
    } catch (error) {
      // 404 covers both "no claims" and offices OPS has no full text for (US).
      if (!isEpoNotFound(error)) throw error;
    }
    void durableSet(key, { claims }, EPO_CONFIG.durableClaimsCacheMs);
    return claims;
  }
  async getPatentFamily(id: string) {
    return (await this.getFamilyMetadata(id)).family;
  }
  async getLegalEvents(id: string): Promise<LegalEvent[]> {
    return (await this.getFamilyMetadata(id)).legalEvents;
  }
}
