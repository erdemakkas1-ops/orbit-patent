import {
  LegalStatus,
  type LegalEventKind,
  type Locale,
  type Patent,
} from "@/types/patent";

/**
 * Splits a docdb publication number into a readable form:
 * US7182230B2 → "US 7,182,230 B2", US20260295860A1 → "US 2026/0295860 A1",
 * EP1234567A1 → "EP 1234567 A1". Unknown shapes are returned untouched.
 */
export function formatPublicationNumber(value: string) {
  const match = /^([A-Z]{2})(\d+)([A-Z]\d?)?$/.exec(value.replace(/\s+/g, ""));
  if (!match) return value;
  const [, country, digits, kind] = match;
  let body = digits;
  if (country === "US" && digits.length === 11 && /^(19|20)/.test(digits))
    body = `${digits.slice(0, 4)}/${digits.slice(4)}`;
  else if (country === "US" && digits.length <= 8)
    body = Number(digits).toLocaleString("en-US");
  return [country, body, kind].filter(Boolean).join(" ");
}

/** EPO titles often arrive in ALL CAPS; render those in sentence case. */
export function readableTitle(title: string, locale: Locale) {
  const letters = title.replace(/[^\p{L}]/gu, "");
  if (letters.length < 4 || letters !== letters.toLocaleUpperCase(locale))
    return title;
  // Caps typed without a dotted "İ" were not cased by Turkish rules
  // ("PIL ENERJI" means "pil", not "pıl"), so fold "I" the English way.
  const rules = locale === "tr" && !title.includes("İ") ? "en" : locale;
  const lower = title.toLocaleLowerCase(rules);
  return lower.charAt(0).toLocaleUpperCase(locale) + lower.slice(1);
}

/** The original publication on Espacenet, the EPO's public viewer. */
export function espacenetUrl(publicationNumber: string) {
  return `https://worldwide.espacenet.com/patent/search?q=pn%3D${encodeURIComponent(publicationNumber.replace(/\s+/g, ""))}`;
}

/** Legal status is national: it always refers to the publishing office. */
export function statusJurisdiction(patent: Patent) {
  return patent.publicationNumber.slice(0, 2).toUpperCase();
}

/** Year of the latest event that put the patent in its current status. */
export function statusYear(patent: Patent) {
  if (patent.legalStatus === LegalStatus.UNKNOWN) return undefined;
  const kinds: Partial<Record<LegalStatus, LegalEventKind[]>> = {
    [LegalStatus.ACTIVE]: ["GRANTED", "REINSTATED", "RENEWED"],
    [LegalStatus.EXPIRED]: ["EXPIRED"],
    [LegalStatus.LAPSED]: ["LAPSED"],
    [LegalStatus.WITHDRAWN]: ["WITHDRAWN"],
    [LegalStatus.ABANDONED]: ["ABANDONED"],
    [LegalStatus.REVOKED]: ["REVOKED"],
  };
  const wanted = kinds[patent.legalStatus] ?? [];
  return patent.legalEvents
    .filter((event) => wanted.includes(event.kind))
    .map((event) => event.date.slice(0, 4))
    .sort()
    .at(-1);
}

// Patents last at most 20 years from filing, plus at most 5 of supplementary
// protection; past that, protection has ended whatever the register shows.
const MAX_PROTECTION_YEARS = 25;

/**
 * True when no register status is known but the filing is old enough that
 * protection must have ended. Shown as an estimate, never as a status.
 */
export function likelyExpired(patent: Patent, now = new Date()) {
  if (patent.legalStatus !== LegalStatus.UNKNOWN) return false;
  const filed = Number(
    /^\d{4}/.exec(
      patent.priorityDate || patent.applicationDate || patent.publicationDate,
    )?.[0],
  );
  return (
    Number.isFinite(filed) &&
    filed > 0 &&
    now.getUTCFullYear() - filed > MAX_PROTECTION_YEARS
  );
}

export function formatShortDate(value: string, locale: Locale) {
  const date = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}/.test(value) || Number.isNaN(date.getTime()))
    return undefined;
  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
