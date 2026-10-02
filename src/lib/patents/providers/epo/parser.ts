import { XMLParser } from "fast-xml-parser";
import type { LegalStatus, Patent, Localized } from "@/types/patent";
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
  isArray: (_name, jpath) =>
    /result$|exchange-document$|document-id$|inventor$|applicant$|classification-ipc$|classification-cpc$|abstract$|title$|p$/.test(
      String(jpath),
    ),
});
type Node = Record<string, unknown>;
const asArray = (value: unknown): Node[] =>
  Array.isArray(value)
    ? value.filter((x): x is Node => !!x && typeof x === "object")
    : value && typeof value === "object"
      ? [value as Node]
      : [];
const one = (value: unknown): Node | undefined => asArray(value)[0];
const text = (value: unknown): string =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : value && typeof value === "object"
      ? Object.values(value as Node)
          .map(text)
          .filter(Boolean)
          .join(" ")
          .trim()
      : "";
const first = (node: Node | undefined, keys: string[]) => {
  if (!node) return "";
  for (const key of keys) {
    const value = text(node[key]);
    if (value) return value;
  }
  return "";
};
const localized = (value: string): Localized => ({ tr: value, en: value });
const normalizeDate = (value: string) =>
  /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`
    : value;
function docIds(node: Node) {
  return asArray(node["document-id"]);
}
function getDocId(root: Node, type: string) {
  const id = docIds(root).find(
    (x) =>
      first(x, [
        "@_document-id-type",
        "document-id-type",
        "kind",
      ]).toLowerCase() === type,
  );
  return id ?? docIds(root)[0];
}
function dateOf(root: Node, relation: string) {
  const relationNode = root[relation] as Node | undefined;
  const id =
    getDocId(relationNode ?? {}, "epodoc") ??
    getDocId(relationNode ?? {}, "docdb");
  return first(id, ["date", "publication-date"]);
}
function publicationNumber(root: Node) {
  const id = getDocId(root, "docdb") ?? getDocId(root, "epodoc");
  const country = first(id, ["country"]);
  const number = first(id, ["doc-number", "docnumber", "number"]);
  const kind = first(id, ["kind"]);
  return `${country}${number}${kind}`.replace(/\s/g, "");
}
function parseDocument(node: Node): Patent | null {
  const bibliographic =
    (node["bibliographic-data"] as Node | undefined) ?? node;
  const pubRef =
    one(bibliographic["publication-reference"]) ??
    (node["document-id"] ? node : {});
  const appRef =
    (bibliographic["application-reference"] as Node | undefined) ?? {};
  const priority = asArray(
    bibliographic["priority-claims"] &&
      (bibliographic["priority-claims"] as Node)["priority-claim"],
  )[0];
  const pubId = getDocId(pubRef, "docdb") ?? getDocId(pubRef, "epodoc");
  const publication = publicationNumber(pubRef);
  if (!publication) return null;
  const titleNode = asArray(bibliographic["invention-title"])[0] ?? {};
  const abstractNode =
    asArray(node["abstract"])[0] ?? asArray(node["abstracts"])[0] ?? {};
  const parties = (bibliographic["parties"] as Node | undefined) ?? {};
  const inventors = asArray(
    parties["inventors"] && (parties["inventors"] as Node)["inventor"],
  )
    .map((x) => first(x, ["inventor-name", "name", "last-name"]))
    .filter(Boolean);
  const applicants = asArray(
    parties["applicants"] && (parties["applicants"] as Node)["applicant"],
  )
    .map((x) => first(x, ["applicant-name", "name", "last-name"]))
    .filter(Boolean);
  const classifications =
    (bibliographic["classifications-ipcr"] as Node | undefined) ?? {};
  const ipc = asArray(
    classifications["classification-ipcr"] ??
      classifications["classification-ipc"],
  )
    .map((x) => first(x, ["text", "classification-symbol"]))
    .map(
      (value) =>
        value.match(/^[A-HY]\d{2}[A-Z]\s*\d+\s*\/\s*\d+/)?.[0] ?? value,
    )
    .map((value) => value.replace(/\s+/g, ""))
    .filter(Boolean);
  const cpcNode =
    (bibliographic["classifications-cpc"] as Node | undefined) ?? {};
  const legacyCpc = asArray(cpcNode["classification-cpc"])
    .map((x) => first(x, ["text", "classification-symbol"]))
    .filter(Boolean);
  const patentClassifications =
    (bibliographic["patent-classifications"] as Node | undefined) ?? {};
  const structuredCpc = asArray(patentClassifications["patent-classification"])
    .filter((classification) => {
      const scheme = classification["classification-scheme"] as
        Node | undefined;
      return first(scheme, ["@_scheme", "#text"]).startsWith("CPC");
    })
    .map((classification) => {
      const section = first(classification, ["section"]);
      const classValue = first(classification, ["class"]);
      const classNumber = classValue.padStart(2, "0");
      const subclass = first(classification, ["subclass"]);
      const mainGroup = first(classification, ["main-group"]);
      const subgroup = first(classification, ["subgroup"]);
      return section && classValue && subclass && mainGroup && subgroup
        ? `${section}${classNumber}${subclass}${mainGroup}/${subgroup}`
        : "";
    })
    .filter(Boolean);
  const cpc = [...new Set([...legacyCpc, ...structuredCpc])];
  const id = publication;
  const title = first(titleNode, ["#text", "text", "invention-title"]);
  const abstract = text(abstractNode);
  const applicationId = getDocId(appRef, "epodoc") ?? getDocId(appRef, "docdb");
  const priorityId = priority
    ? (getDocId(priority, "epodoc") ?? getDocId(priority, "docdb"))
    : undefined;
  return {
    id,
    publicationNumber: publication,
    applicationNumber: first(applicationId, [
      "doc-number",
      "docnumber",
      "number",
    ]),
    title: localized(title || publication),
    abstract: localized(abstract),
    description: localized(abstract),
    inventors,
    applicants,
    publicationDate: normalizeDate(first(pubId, ["date", "publication-date"])),
    applicationDate: normalizeDate(
      first(appRef, ["date", "application-date"]) ||
        dateOf(bibliographic, "application-reference"),
    ),
    priorityDate: normalizeDate(first(priorityId, ["date", "priority-date"])),
    cpc,
    ipc,
    legalStatus: "UNKNOWN" as LegalStatus,
    legalEvents: [],
    drawings: [],
    family: [],
    source: "epo",
  };
}
export function parseEpoSearch(xml: string) {
  const root = parser.parse(xml) as Node;
  const world = (root["world-patent-data"] as Node | undefined) ?? root;
  const biblioSearch = one(world["biblio-search"]) ?? world;
  const search = one(biblioSearch["search-result"]) ?? biblioSearch;
  const publicationReferences = asArray(search["publication-reference"]);
  const resultNodes = asArray(search["result"]);
  const exchangeDocuments = [search, ...resultNodes].flatMap((result) => {
    const container = one(result["exchange-documents"]);
    return asArray(
      container?.["exchange-document"] ?? result["exchange-document"],
    );
  });
  const items = exchangeDocuments.length
    ? exchangeDocuments
    : publicationReferences;
  const patents = items.map(parseDocument).filter((x): x is Patent => !!x);
  const totalText =
    first(biblioSearch, ["@_total-result-count", "total-result-count"]) ||
    first(search, ["@_total-result-count", "total-result-count"]);
  const parsedTotal = Number.parseInt(totalText, 10);
  return {
    total: Number.isFinite(parsedTotal) ? parsedTotal : patents.length,
    patents,
    diagnostics: {
      publicationReferences: publicationReferences.length,
      opsPublicationReferences: (
        xml.match(/<ops:publication-reference(?:\s|>)/g) ?? []
      ).length,
      exchPublicationReferences: (
        xml.match(/<exch:publication-reference(?:\s|>)/g) ?? []
      ).length,
      exchangeDocuments: (xml.match(/<exch:exchange-document(?:\s|>)/g) ?? [])
        .length,
    },
  };
}
export function parseEpoBiblio(xml: string) {
  const root = parser.parse(xml) as Node;
  const world = (root["world-patent-data"] as Node | undefined) ?? root;
  const docs = asArray(
    world["exchange-documents"] &&
      (world["exchange-documents"] as Node)["exchange-document"],
  );
  return parseDocument(docs[0] ?? world);
}
