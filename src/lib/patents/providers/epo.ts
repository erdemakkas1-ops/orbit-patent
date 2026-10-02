import type { PatentProvider } from "./provider";
import type {
  Patent,
  PatentSearch,
  SearchResult,
  LegalEvent,
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

export type EpoResponseMetadata = {
  status: number;
  contentType: string;
  durationMs: number;
  safeErrorSummary?: string;
};

export class EpoOpsHttpError extends Error {
  constructor(
    readonly status: number,
    readonly safeSummary: string,
  ) {
    super("EPO_UPSTREAM_UNAVAILABLE");
  }
}

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
    if (!/^(published-data|family)\/[a-z0-9./_-]+$/i.test(path))
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
    const { response, durationMs } = await this.fetchAuthorized(
      path,
      "application/exchange+xml",
      params,
      range,
    );
    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();
    const safeErrorSummary = response.ok
      ? undefined
      : safeUpstreamSummary(body);
    observe?.({
      status: response.status,
      contentType,
      durationMs,
      safeErrorSummary,
    });
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
export class EpoOpsPatentProvider implements PatentProvider {
  readonly source = "epo" as const;
  private readonly searchCache = new Map<string, CacheEntry<SearchResult>>();
  private readonly detailCache = new Map<string, CacheEntry<Patent | null>>();
  private readonly images: EpoImageService;
  constructor(readonly client: EpoOpsClient) {
    this.images = new EpoImageService(client);
  }
  async searchPatents(query: PatentSearch): Promise<SearchResult> {
    const key = stableCacheKey("epo-search", query);
    const cached = this.searchCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    const { q, range } = buildSearchParams(query, EPO_CONFIG.pageSize);
    const parsed = parseEpoSearch(
      await this.client.request("published-data/search", { q }, range),
    );
    const result = {
      patents: parsed.patents,
      total: parsed.total,
      page: query.page,
      pageSize: EPO_CONFIG.pageSize,
      source: "epo" as const,
    };
    this.searchCache.set(key, {
      value: result,
      expires: Date.now() + EPO_CONFIG.searchCacheMs,
    });
    return result;
  }
  async getPatentById(id: string): Promise<Patent | null> {
    const identifier = parsePatentIdentifier(id);
    if (!identifier) throw new Error("EPO_INVALID_IDENTIFIER");
    const normalizedId = toRouteIdentifier(identifier);
    const cached = this.detailCache.get(normalizedId);
    if (cached && cached.expires > Date.now()) return cached.value;
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
        ![400, 404].includes(error.status) ||
        !docdb
      )
        throw error;
      xml = await request(
        "DOCDB",
        `published-data/publication/docdb/${docdb}/biblio`,
      );
    }
    const patent = parseEpoBiblio(xml);
    if (patent) {
      try {
        patent.drawings = await this.images.getDrawings(
          patent.publicationNumber || normalizedId,
        );
        patent.drawingStatus = patent.drawings.length ? "available" : "none";
      } catch {
        patent.drawings = [];
        patent.drawingStatus = "unavailable";
      }
    }
    this.detailCache.set(normalizedId, {
      value: patent,
      expires: Date.now() + EPO_CONFIG.detailCacheMs,
    });
    return patent;
  }
  getPatentDrawings(id: string) {
    return this.images.getDrawings(id);
  }
  getPatentDrawingPage(id: string, page: number) {
    return this.images.getDrawingPage(id, page);
  }
  async getPatentFamily(id: string) {
    return (await this.getPatentById(id))?.family ?? [];
  }
  async getLegalEvents(id: string): Promise<LegalEvent[]> {
    return (await this.getPatentById(id))?.legalEvents ?? [];
  }
}
