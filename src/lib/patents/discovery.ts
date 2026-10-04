import { z } from "zod";
import {
  LegalStatus,
  type DiscoveryCategory,
  type DiscoveryFilters,
  type Patent,
} from "@/types/patent";
import { fold } from "./search-schema";

export const discoveryCategories = [
  "robotics",
  "automation",
  "sensors",
  "electronics",
  "energy",
  "mechanical",
  "manufacturing",
  "assistive",
] as const satisfies readonly DiscoveryCategory[];

export const discoverySearchTerms = {
  robotics: ["robot", "gripper", "manipulator"],
  automation: ["automation", "control", "conveyor"],
  sensors: ["sensor", "detector", "sensing"],
  electronics: ["electronic", "circuit", "semiconductor"],
  energy: ["battery", "energy", "power"],
  mechanical: ["mechanical", "gear", "transmission"],
  manufacturing: ["manufacturing", "production", "printing"],
  assistive: ["assistive", "prosthetic", "mobility"],
} as const satisfies Record<DiscoveryCategory, readonly string[]>;

export const yearRanges = {
  // Published 26+ years ago: past even the longest term (20 years + 5 of
  // supplementary protection), counted from a filing before publication.
  "likely-expired": { to: new Date().getUTCFullYear() - 26 },
  "before-2000": { to: 1999 },
  "2000-2009": { from: 2000, to: 2009 },
  "2010-2019": { from: 2010, to: 2019 },
  "2020-present": { from: 2020 },
} as const;
export type YearRangeKey = keyof typeof yearRanges;

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(values).optional(),
  );

export const discoveryQuerySchema = z.object({
  category: optionalEnum(discoveryCategories),
  status: z.preprocess(
    (value) =>
      typeof value === "string" && value ? value.toUpperCase() : undefined,
    z.enum(LegalStatus).optional(),
  ),
  year: optionalEnum(
    Object.keys(yearRanges) as [YearRangeKey, ...YearRangeKey[]],
  ),
  sort: z.enum(["featured", "newest", "oldest"]).default("featured"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>;

/**
 * The filters a discover URL resolves to. Shared by the page and the cache
 * warmer so both produce the same cache key.
 */
export function discoveryFiltersFor(
  query: Pick<DiscoveryQuery, "category" | "status" | "year" | "sort" | "page">,
  live: boolean,
): DiscoveryFilters {
  return {
    category: query.category,
    legalStatus: live ? undefined : query.status,
    yearRange: query.year ? yearRanges[query.year] : undefined,
    sort: live ? "featured" : query.sort,
    page: query.page,
    pageSize: live ? 6 : 20,
  };
}

/** Every first page reachable from the discover filters (54 today). */
export function discoveryWarmList() {
  const categories = [undefined, ...discoveryCategories];
  const years = [undefined, ...(Object.keys(yearRanges) as YearRangeKey[])];
  return categories.flatMap((category) =>
    years.map((year) =>
      discoveryFiltersFor(
        { category, year, status: undefined, sort: "featured", page: 1 },
        true,
      ),
    ),
  );
}

const categoryRules: Array<[DiscoveryCategory, RegExp]> = [
  ["assistive", /\b(a61f|a61h)|baston|cane|assistive|yardimci|grip aid/],
  ["robotics", /\bb25j|robot|gripper|kavrayici/],
  ["automation", /\b(g05b|b07c)|konveyor|conveyor|maintenance|bakim|sorter/],
  ["sensors", /\b(g01h|g01n|g01s)|sensor|sensor|algilayici|kamera|camera/],
  ["energy", /\b(h01m|h02n|h10n)|batarya|battery|energy|enerji|thermal|termo/],
  ["manufacturing", /\b(b29c|b33y)|manufactur|uretim|nozul|nozzle|printing/],
  ["electronics", /\b(h01|h02|g05)|electronic|elektronik|radio|processor/],
  ["mechanical", /\b(f16h|f16)|mechanical|mekanik|gear|reduktor|rulman/],
];

export function categorizePatent(patent: Patent): DiscoveryCategory | null {
  const corpus = fold(
    JSON.stringify([patent.title, patent.abstract, patent.cpc, patent.ipc]),
  );
  return categoryRules.find(([, pattern]) => pattern.test(corpus))?.[0] ?? null;
}

export function featuredScore(patent: Patent) {
  const year = Number(patent.publicationDate.slice(0, 4)) || 0;
  return (
    (patent.drawings.length ? 30 : 0) +
    (patent.abstract.tr || patent.abstract.en ? 20 : 0) +
    // A register-backed status beats "no data" on curated surfaces.
    (patent.legalStatus !== LegalStatus.UNKNOWN ? 25 : 0) +
    Math.max(0, Math.min(20, year - 2000))
  );
}

export function isPatentIdentifier(value: string) {
  return normalizePatentIdentifier(value) !== null;
}

export function normalizePatentIdentifier(value: string) {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .replace(/[\s-]/g, "")
    .toUpperCase();
  return /^(?:[A-Z]{2})?\d{6,12}(?:[A-Z]\d?)?$/.test(normalized)
    ? normalized
    : null;
}
