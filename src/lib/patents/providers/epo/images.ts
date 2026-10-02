import sharp from "sharp";
import { XMLParser } from "fast-xml-parser";
import type { Patent } from "@/types/patent";
import { EPO_CONFIG } from "./config";
import {
  parsePatentIdentifier,
  toDocdbIdentifier,
  toEpodocIdentifier,
  toRouteIdentifier,
  type ParsedPatentIdentifier,
} from "./identifier";

type Node = Record<string, unknown>;
type CacheEntry<T> = { expires: number; value: T };
type ImageClient = {
  request(path: string): Promise<string>;
  requestBinary(
    path: string,
    accept: string,
    range: string,
  ): Promise<{ body: Uint8Array; contentType: string }>;
};

export type DrawingAvailability = {
  identifier: ParsedPatentIdentifier;
  imageType: "thumbnail" | "fullimage";
  pages: number[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
});

const asArray = (value: unknown): Node[] =>
  Array.isArray(value)
    ? value.filter((item): item is Node => !!item && typeof item === "object")
    : value && typeof value === "object"
      ? [value as Node]
      : [];

const value = (node: Node | undefined, key: string) => {
  const result = node?.[key];
  return typeof result === "string" || typeof result === "number"
    ? String(result).trim()
    : "";
};

function inquiryIdentifier(inquiry: Node) {
  const result = inquiry["inquiry-result"] as Node | undefined;
  const reference =
    (result?.["publication-reference"] as Node | undefined) ??
    (inquiry["publication-reference"] as Node | undefined);
  const documentId = asArray(reference?.["document-id"])[0];
  if (!documentId) return null;
  return parsePatentIdentifier(
    `${value(documentId, "country")}${value(documentId, "doc-number")}${value(documentId, "kind")}`,
  );
}

function sections(instance: Node) {
  return asArray(instance["document-section"]).map((section) => ({
    name: value(section, "@_name").toUpperCase(),
    startPage: Number.parseInt(value(section, "@_start-page"), 10),
  }));
}

export function parseEpoImageAvailability(
  xml: string,
): DrawingAvailability | null {
  const root = parser.parse(xml) as Node;
  const world = (root["world-patent-data"] as Node | undefined) ?? root;
  const inquiry = (world["document-inquiry"] as Node | undefined) ?? world;
  const result = (inquiry["inquiry-result"] as Node | undefined) ?? inquiry;
  const identifier = inquiryIdentifier(inquiry);
  if (!identifier?.kindCode) return null;
  const instances = asArray(result["document-instance"]);
  const drawing = instances.find(
    (instance) =>
      value(instance, "@_desc").toLowerCase() === "drawing" &&
      sections(instance).some((section) => section.name === "DRAWINGS"),
  );
  if (drawing) {
    const count = Math.min(
      EPO_CONFIG.maxDrawingPages,
      Number.parseInt(value(drawing, "@_number-of-pages"), 10) || 0,
    );
    if (count < 1) return null;
    return {
      identifier,
      imageType: "thumbnail",
      pages: Array.from({ length: count }, (_, index) => index + 1),
    };
  }
  const fullDocument = instances.find((instance) => {
    const names = sections(instance).map((section) => section.name);
    return names.includes("DRAWINGS");
  });
  if (!fullDocument) return null;
  const ordered = sections(fullDocument)
    .filter((section) => Number.isFinite(section.startPage))
    .sort((a, b) => a.startPage - b.startPage);
  const drawingIndex = ordered.findIndex(
    (section) => section.name === "DRAWINGS",
  );
  const start = ordered[drawingIndex]?.startPage;
  const total = Number.parseInt(value(fullDocument, "@_number-of-pages"), 10);
  const end = ordered[drawingIndex + 1]?.startPage
    ? ordered[drawingIndex + 1].startPage - 1
    : total;
  if (!start || !end || end < start) return null;
  return {
    identifier,
    imageType: "fullimage",
    pages: Array.from(
      { length: Math.min(EPO_CONFIG.maxDrawingPages, end - start + 1) },
      (_, index) => start + index,
    ),
  };
}

export class EpoImageService {
  private readonly metadataCache = new Map<
    string,
    CacheEntry<DrawingAvailability | null>
  >();
  private readonly pageCache = new Map<
    string,
    CacheEntry<{ body: Uint8Array; contentType: "image/png" }>
  >();

  constructor(private readonly client: ImageClient) {}

  private async availability(id: string) {
    const identifier = parsePatentIdentifier(id);
    if (!identifier) throw new Error("EPO_INVALID_IDENTIFIER");
    const cacheKey = toRouteIdentifier(identifier);
    const cached = this.metadataCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.value;
    const docdb = toDocdbIdentifier(identifier);
    const format = docdb ? "docdb" : "epodoc";
    const number = docdb ?? toEpodocIdentifier(identifier);
    const parsed = parseEpoImageAvailability(
      await this.client.request(
        `published-data/publication/${format}/${number}/images`,
      ),
    );
    this.metadataCache.set(cacheKey, {
      value: parsed,
      expires: Date.now() + EPO_CONFIG.drawingMetadataCacheMs,
    });
    return parsed;
  }

  async getDrawings(id: string): Promise<Patent["drawings"]> {
    const availability = await this.availability(id);
    if (!availability) return [];
    const routeId = toRouteIdentifier(availability.identifier);
    return availability.pages.map((_, index) => ({
      url: `/api/patents/${encodeURIComponent(routeId)}/drawings/${index + 1}`,
      caption: {
        tr: `EPO patent çizimi · sayfa ${index + 1}`,
        en: `EPO patent drawing · page ${index + 1}`,
      },
    }));
  }

  async getDrawingPage(id: string, page: number) {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > EPO_CONFIG.maxDrawingPages
    )
      throw new Error("EPO_INVALID_DRAWING_PAGE");
    const availability = await this.availability(id);
    const upstreamPage = availability?.pages[page - 1];
    if (!availability || !upstreamPage)
      throw new Error("EPO_DRAWING_NOT_FOUND");
    const routeId = toRouteIdentifier(availability.identifier);
    const cacheKey = `${routeId}:${page}`;
    const cached = this.pageCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.value;
    const { country, documentNumber, kindCode } = availability.identifier;
    const response = await this.client.requestBinary(
      `published-data/images/${country}/${documentNumber}/${kindCode}/${availability.imageType}`,
      "application/tiff",
      String(upstreamPage),
    );
    if (!/^application\/tiff(?:;|$)/i.test(response.contentType))
      throw new Error("EPO_DRAWING_INVALID_CONTENT");
    const body = new Uint8Array(
      await sharp(Buffer.from(response.body)).png().toBuffer(),
    );
    const result = { body, contentType: "image/png" as const };
    this.pageCache.set(cacheKey, {
      value: result,
      expires: Date.now() + EPO_CONFIG.drawingPageCacheMs,
    });
    return result;
  }
}
