import { XMLParser } from "fast-xml-parser";
import type { LegalEvent, LegalEventKind, Patent } from "@/types/patent";

type Node = Record<string, unknown>;
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
  isArray: (name) => ["family-member", "document-id", "legal"].includes(name),
});
const array = (value: unknown): Node[] =>
  Array.isArray(value)
    ? value.filter((item): item is Node => !!item && typeof item === "object")
    : value && typeof value === "object"
      ? [value as Node]
      : [];
const scalar = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
const field = (node: Node | undefined, name: string) => scalar(node?.[name]);
const normalizeDate = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length === 8
    ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
    : "";
};

export function mapEpoLegalEvent(
  code: string,
  description: string,
): LegalEventKind {
  const value = `${code} ${description}`.toUpperCase();
  if (/\b(REINSTATED|REINSTATEMENT|RESTORATION)\b/.test(value))
    return "REINSTATED";
  if (/\b(REVOKED|REVOCATION)\b/.test(value)) return "REVOKED";
  if (/\b(WITHDRAWN|WITHDRAWAL)\b/.test(value)) return "WITHDRAWN";
  if (/\bABANDON(ED|MENT)?\b/.test(value)) return "ABANDONED";
  if (/\b(EXPIRED|EXPIRY|EXPIRATION)\b/.test(value)) return "EXPIRED";
  if (/\b(LAPSED|LAPSE|CEASED|NON[- ]PAYMENT)\b/.test(value)) return "LAPSED";
  if (/\b(RENEWAL|RENEWED|FEE PAYMENT)\b/.test(value)) return "RENEWED";
  if (/\b(GRANT OF PATENT|PATENT GRANTED)\b/.test(value)) return "GRANTED";
  if (/\b(APPLICATION FILED|FILING OF APPLICATION)\b/.test(value))
    return "FILED";
  return "UNMAPPED";
}

function documentId(reference: Node | undefined) {
  const ids = array(reference?.["document-id"]);
  return (
    ids.find((id) => field(id, "@_document-id-type") === "docdb") ?? ids[0]
  );
}

export function parseEpoFamilyLegal(xml: string): {
  family: Patent["family"];
  legalEvents: LegalEvent[];
} {
  const root = parser.parse(xml) as Node;
  const world = (root["world-patent-data"] as Node | undefined) ?? root;
  const familyNode = (world["patent-family"] as Node | undefined) ?? world;
  const members = array(familyNode["family-member"]);
  const family = new Map<
    string,
    { publicationNumber: string; country: string }
  >();
  const legalEvents: LegalEvent[] = [];

  members.forEach((member, memberIndex) => {
    const reference = member["publication-reference"] as Node | undefined;
    const id = documentId(reference);
    const country = field(id, "country");
    const publicationNumber =
      `${country}${field(id, "doc-number")}${field(id, "kind")}`.replace(
        /\s/g,
        "",
      );
    if (publicationNumber)
      family.set(publicationNumber, { publicationNumber, country });

    array(member.legal).forEach((legal, eventIndex) => {
      const code = field(legal, "@_code").trim();
      const description = field(legal, "@_desc")
        .replace(/\s+/g, " ")
        .slice(0, 500);
      const entries = Object.entries(legal);
      const readDescribed = (label: RegExp) => {
        const value = entries.find(([, item]) => {
          const node = item as Node | undefined;
          return node && label.test(field(node, "@_desc"));
        })?.[1];
        return typeof value === "object"
          ? field(value as Node, "#text")
          : scalar(value);
      };
      const jurisdiction = readDescribed(/Country Code/i) || country || "";
      const date = normalizeDate(readDescribed(/Gazette DATE/i));
      if (!date || !jurisdiction) return;
      legalEvents.push({
        id: `${publicationNumber || memberIndex}-${date}-${code || eventIndex}`,
        date,
        jurisdiction,
        kind: mapEpoLegalEvent(code, description),
        description: { tr: description || code, en: description || code },
        source: "epo",
      });
    });
  });

  return {
    family: [...family.values()],
    legalEvents: [
      ...new Map(legalEvents.map((event) => [event.id, event])).values(),
    ].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
