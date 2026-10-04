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

export type DrawingVariant = "full" | "card";

export const CARD_TRIM_THRESHOLD = 18;
const CARD_TRIM_BORDER = 8;
const CARD_TRIM_MIN_DIMENSION = 64;
const CARD_TRIM_MIN_RATIO = 0.025;
const CARD_TRIM_MIN_AREA_RATIO = 0.005;

/**
 * US publications print a one-line running header ("Patent Application Publication
 * ... Sheet 1 of 4 ... US 2026/...") above the drawing. It is a thin band of ink
 * spanning most of the page width; a lone "FIG. 1" label is narrow and is kept.
 */
async function removeStandardPatentHeader(body: Buffer) {
  const sample = await sharp(body)
    .resize({ width: 510, withoutEnlargement: true })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = sample.info;
  const inkSpan = (y: number) => {
    let left = -1;
    let right = -1;
    for (let x = 0; x < width; x += 1)
      if (sample.data[y * width + x] < 200) {
        if (left < 0) left = x;
        right = x;
      }
    return left < 0 ? 0 : right - left + 1;
  };
  let bandStart = -1;
  for (let y = 0; y < height * 0.08 && bandStart < 0; y += 1)
    if (inkSpan(y)) bandStart = y;
  if (bandStart < 0) return body;
  let bandEnd = bandStart;
  let widest = 0;
  while (bandEnd < height && inkSpan(bandEnd)) {
    widest = Math.max(widest, inkSpan(bandEnd));
    bandEnd += 1;
  }
  if (bandEnd - bandStart > height * 0.04 || widest < width * 0.55)
    return body;
  let gapEnd = bandEnd;
  while (gapEnd < height && !inkSpan(gapEnd)) gapEnd += 1;
  if (gapEnd - bandEnd < Math.max(3, height * 0.008) || gapEnd >= height)
    return body;
  const { width: sourceWidth = 0, height: sourceHeight = 0 } =
    await sharp(body).metadata();
  if (!sourceWidth || !sourceHeight) return body;
  const top = Math.floor((bandEnd / height) * sourceHeight);
  if (top > sourceHeight * 0.2) return body;
  return sharp(body)
    .extract({ left: 0, top, width: sourceWidth, height: sourceHeight - top })
    .png()
    .toBuffer();
}

/**
 * Old scans often carry a long, thin scanner line at the page edge, which stops
 * the white-margin trim from shrinking the page to the drawing. Patent margins
 * keep real drawings out of the outer 4%, so a long thin stroke there is erased.
 */
async function eraseScanEdgeLines(body: Buffer) {
  const { data, info } = await sharp(body)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const ink = (x: number, y: number) => data[y * width + x] < 128;
  const band = (length: number) => Math.max(4, Math.round(length * 0.04));
  // [first, last) ranges along the edge-perpendicular axis, per side
  const sides = [
    { vertical: true, from: 0, to: band(width) },
    { vertical: true, from: width - band(width), to: width },
    { vertical: false, from: 0, to: band(height) },
    { vertical: false, from: height - band(height), to: height },
  ];
  let changed = false;
  for (const side of sides) {
    const along = side.vertical ? height : width;
    const span = side.to - side.from;
    let covered = 0;
    const thickness = new Array<number>(span).fill(0);
    for (let a = 0; a < along; a += 1) {
      let hit = false;
      for (let b = side.from; b < side.to; b += 1)
        if (side.vertical ? ink(b, a) : ink(a, b)) {
          hit = true;
          thickness[b - side.from] += 1;
        }
      if (hit) covered += 1;
    }
    const strokeWidth = thickness.filter((count) => count > along * 0.01)
      .length;
    const across = side.vertical ? width : height;
    if (covered < along * 0.3 || strokeWidth > across * 0.015) continue;
    for (let a = 0; a < along; a += 1)
      for (let b = side.from; b < side.to; b += 1)
        data[side.vertical ? a * width + b : b * width + a] = 255;
    changed = true;
  }
  if (!changed) return body;
  return sharp(data, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

/**
 * Drops page furniture far from the drawing: a publication number printed at
 * the top, a page number at the bottom. Ink rows are grouped into blocks
 * (gaps under 8% of the page join), the block with the most ink is the
 * drawing, and blocks with under a tenth of its ink are cut away. A "FIG. 1"
 * label sits close to its drawing and stays in the same block.
 */
async function cropToMainContent(body: Buffer) {
  const sample = await sharp(body)
    .resize({ width: 510, withoutEnlargement: true })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = sample.info;
  const ink = Array.from({ length: height }, (_, y) => {
    let count = 0;
    for (let x = 0; x < width; x += 1)
      if (sample.data[y * width + x] < 160) count += 1;
    return count;
  });
  const joinGap = Math.max(4, Math.round(height * 0.08));
  const blocks: { top: number; bottom: number; ink: number }[] = [];
  let gap = Infinity;
  for (let y = 0; y < height; y += 1) {
    if (!ink[y]) {
      gap += 1;
      continue;
    }
    const last = blocks.at(-1);
    if (last && gap < joinGap) {
      last.bottom = y;
      last.ink += ink[y];
    } else blocks.push({ top: y, bottom: y, ink: ink[y] });
    gap = 0;
  }
  if (blocks.length < 2) return body;
  const main = Math.max(...blocks.map((block) => block.ink));
  const kept = blocks.filter((block) => block.ink >= main * 0.1);
  const top = Math.min(...kept.map((block) => block.top));
  const bottom = Math.max(...kept.map((block) => block.bottom));
  if (top === blocks[0].top && bottom === blocks.at(-1)!.bottom) return body;
  const { width: sourceWidth = 0, height: sourceHeight = 0 } =
    await sharp(body).metadata();
  if (!sourceWidth || !sourceHeight) return body;
  const scale = sourceHeight / height;
  const from = Math.max(0, Math.floor((top - 2) * scale));
  const to = Math.min(sourceHeight, Math.ceil((bottom + 3) * scale));
  if (to - from < sourceHeight * 0.05) return body;
  return sharp(body)
    .extract({ left: 0, top: from, width: sourceWidth, height: to - from })
    .png()
    .toBuffer();
}

/** Card plate at 2x of its largest CSS size (~380x285). */
export const CARD_RENDER_BOX = { width: 760, height: 570 } as const;

/**
 * Line art at 300 dpi shrinks 4-6x into a card: 1px strokes turn into faint,
 * broken grey. Thicken strokes before a heavy downscale, size the image for the
 * card here, deepen the greys and ship lossless PNG so nothing re-blurs it.
 */
export async function renderCardDrawing(body: Uint8Array) {
  const source = Buffer.from(body);
  try {
    const { width = 0, height = 0 } = await sharp(source).metadata();
    if (!width || !height) return new Uint8Array(source);
    const scale = Math.min(
      1,
      CARD_RENDER_BOX.width / width,
      CARD_RENDER_BOX.height / height,
    );
    let image = sharp(source)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .greyscale();
    if (scale < 0.3) image = sharp(await image.dilate(1).png().toBuffer());
    return new Uint8Array(
      await image
        .resize({
          width: CARD_RENDER_BOX.width,
          height: CARD_RENDER_BOX.height,
          fit: "inside",
          withoutEnlargement: true,
        })
        .linear(1.45, -110)
        .png({ palette: true, colours: 16 })
        .toBuffer(),
    );
  } catch {
    return new Uint8Array(source);
  }
}

export async function trimPatentDrawingForCard(body: Uint8Array) {
  const original = Buffer.from(body);
  try {
    const originalMetadata = await sharp(original).metadata();
    const originalWidth = originalMetadata.width ?? 0;
    const originalHeight = originalMetadata.height ?? 0;
    if (!originalWidth || !originalHeight) return new Uint8Array(original);
    const normalized = await sharp(original)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer();
    const contentPage = await cropToMainContent(
      await removeStandardPatentHeader(await eraseScanEdgeLines(normalized)),
    );
    const trimmed = await sharp(contentPage)
      .trim({
        background: { r: 255, g: 255, b: 255 },
        threshold: CARD_TRIM_THRESHOLD,
      })
      .png()
      .toBuffer({ resolveWithObject: true });
    const width = trimmed.info.width;
    const height = trimmed.info.height;
    const areaRatio =
      (width * height) / Math.max(1, originalWidth * originalHeight);
    const suspicious =
      width < CARD_TRIM_MIN_DIMENSION ||
      height < CARD_TRIM_MIN_DIMENSION ||
      width / originalWidth < CARD_TRIM_MIN_RATIO ||
      height / originalHeight < CARD_TRIM_MIN_RATIO ||
      areaRatio < CARD_TRIM_MIN_AREA_RATIO;
    const unchanged =
      width >= originalWidth - 2 && height >= originalHeight - 2;
    if (suspicious || unchanged) return new Uint8Array(original);
    return new Uint8Array(
      await sharp(trimmed.data)
        .extend({
          top: CARD_TRIM_BORDER,
          right: CARD_TRIM_BORDER,
          bottom: CARD_TRIM_BORDER,
          left: CARD_TRIM_BORDER,
          background: { r: 255, g: 255, b: 255 },
        })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .png()
        .toBuffer(),
    );
  } catch {
    return new Uint8Array(original);
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
  // Keep values as text: CPC subgroups ("084") and doc numbers keep leading zeros.
  parseTagValue: false,
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

  async getDrawingPage(
    id: string,
    page: number,
    variant: DrawingVariant = "full",
  ) {
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
    const cacheKey = `${routeId}:${page}:${variant}`;
    const cached = this.pageCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.value;
    const fullCacheKey = `${routeId}:${page}:full`;
    const fullCached = this.pageCache.get(fullCacheKey);
    let full =
      fullCached?.expires && fullCached.expires > Date.now()
        ? fullCached.value
        : undefined;
    const { country, documentNumber, kindCode } = availability.identifier;
    if (!full) {
      const response = await this.client.requestBinary(
        `published-data/images/${country}/${documentNumber}/${kindCode}/${availability.imageType}`,
        "application/tiff",
        String(upstreamPage),
      );
      if (!/^application\/tiff(?:;|$)/i.test(response.contentType))
        throw new Error("EPO_DRAWING_INVALID_CONTENT");
      full = {
        body: new Uint8Array(
          await sharp(Buffer.from(response.body)).png().toBuffer(),
        ),
        contentType: "image/png" as const,
      };
      this.pageCache.set(fullCacheKey, {
        value: full,
        expires: Date.now() + EPO_CONFIG.drawingPageCacheMs,
      });
    }
    if (variant === "full") return full;
    const result = {
      body: await renderCardDrawing(await trimPatentDrawingForCard(full.body)),
      contentType: "image/png" as const,
    };
    this.pageCache.set(cacheKey, {
      value: result,
      expires: Date.now() + EPO_CONFIG.drawingPageCacheMs,
    });
    return result;
  }
}
