import { z } from "zod";
import {
  LegalStatus,
  type DiscoveryCategory,
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

export const yearRanges = {
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

export function categorizePatent(patent: Patent): DiscoveryCategory {
  const corpus = fold(
    JSON.stringify([patent.title, patent.abstract, patent.cpc, patent.ipc]),
  );
  return (
    categoryRules.find(([, pattern]) => pattern.test(corpus))?.[0] ??
    "mechanical"
  );
}

export function featuredScore(patent: Patent) {
  const year = Number(patent.publicationDate.slice(0, 4)) || 0;
  return (
    (patent.drawings.length ? 30 : 0) +
    (patent.abstract.tr || patent.abstract.en ? 20 : 0) +
    (patent.legalStatus === LegalStatus.ACTIVE ? 25 : 0) +
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
