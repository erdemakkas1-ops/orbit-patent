import type { Locale, Patent } from "@/types/patent";

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
  const lower = title.toLocaleLowerCase(locale);
  return lower.charAt(0).toLocaleUpperCase(locale) + lower.slice(1);
}

/** Jurisdiction the legal status refers to: latest legal event, else the publishing office. */
export function statusJurisdiction(patent: Patent) {
  const latest = [...patent.legalEvents]
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  return latest?.jurisdiction || patent.publicationNumber.slice(0, 2);
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
