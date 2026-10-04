import type { PatentClaim, PatentClaims } from "@/types/patent";

const decode = (value: string) =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

// A claim that refers back to another claim is dependent ("according to
// claim 1", "selon la revendication 1", "nach Anspruch 1").
const DEPENDENT =
  /\b(claims?|revendications?|anspr(?:u|ü)che?|anspruchs?)\s+\d/i;

/**
 * Parses OPS full-text claims. OPS returns plain text per <claim-text>;
 * claims start with "1.", "2." … which is how they are split and numbered.
 */
export function parseEpoClaims(xml: string): PatentClaims | null {
  const block = /<claims\b([^>]*)>([\s\S]*?)<\/claims>/i.exec(xml);
  if (!block) return null;
  const language = /lang="([^"]+)"/i.exec(block[1])?.[1]?.toUpperCase() ?? "";
  const text = [...block[2].matchAll(/<claim-text>([\s\S]*?)<\/claim-text>/gi)]
    .map((match) => decode(match[1]))
    .filter(Boolean)
    .join("\n");
  // A claim starts at a new line or after ".", ";" or ":", and only with the
  // next expected number, so "between 1 and 2. positions" stays inside claim 1.
  const starts: { number: number; index: number; bodyStart: number }[] = [];
  for (const match of text.matchAll(/(?<=^|\n|[.;:]\s+)(\d{1,3})\s*[.)]\s+/g)) {
    const number = Number(match[1]);
    if (number !== starts.length + 1) continue;
    starts.push({
      number,
      index: match.index,
      bodyStart: match.index + match[0].length,
    });
  }
  const claims: PatentClaim[] = starts.map((start, position) => {
    const body = text
      .slice(start.bodyStart, starts[position + 1]?.index ?? text.length)
      .replace(/\s+/g, " ")
      .trim()
      // Some offices print the number twice ("1. 1. A system…").
      .replace(new RegExp(`^${start.number}\\s*[.)]\\s+`), "");
    return {
      number: start.number,
      text: body,
      independent: !DEPENDENT.test(body),
    };
  });
  return claims.length ? { language, claims } : null;
}
