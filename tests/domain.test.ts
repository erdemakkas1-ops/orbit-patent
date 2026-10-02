import test from "node:test";
import assert from "node:assert/strict";
import { MockPatentProvider } from "../src/lib/patents/providers/mock";
import { MockAiProvider } from "../src/lib/ai/mock";
import { resolvePatentLegalStatus } from "../src/lib/patents/legal-status/resolve";
import { LegalStatus, type LegalEvent } from "../src/types/patent";
import { searchSchema } from "../src/lib/patents/search-schema";
import {
  categorizePatent,
  discoveryQuerySchema,
  isPatentIdentifier,
  yearRanges,
} from "../src/lib/patents/discovery";
import { mockPatents } from "../src/data/mock-patents";
import { intentSchema, materialSchema } from "../src/types/ai";
import {
  calculateCost,
  calculateDifficulty,
  calculateRelevance,
} from "../src/lib/ai/engines";
import { AsyncTtlCache, allowsMockFallback } from "../src/lib/ai/cache";
import {
  buildEpoQuery,
  buildSearchParams,
} from "../src/lib/patents/providers/epo/query";
import {
  parseEpoSearch,
  parseEpoBiblio,
} from "../src/lib/patents/providers/epo/parser";
import { readFileSync } from "node:fs";
import { EpoAuth } from "../src/lib/patents/providers/epo/auth";
import {
  EpoOpsClient,
  EpoOpsHttpError,
  EpoOpsPatentProvider,
} from "../src/lib/patents/providers/epo";
import {
  parsePatentIdentifier,
  toDocdbIdentifier,
  toEpodocIdentifier,
} from "../src/lib/patents/providers/epo/identifier";
import {
  EpoImageService,
  parseEpoImageAvailability,
} from "../src/lib/patents/providers/epo/images";
import {
  finiteClamp,
  normalizeCost,
  normalizeDifficulty,
  normalizeModernization,
  normalizeSimplification,
  patentDisplay,
  safeText,
} from "../src/lib/ai/safety";
import {
  resolveProviderModes,
  validateEnvironment,
} from "../src/lib/env-schema";
import { publicErrorCode } from "../src/lib/errors";
import { buildMetadata, seoCopy, siteUrl } from "../src/lib/seo";
import { stableCacheKey } from "../src/lib/cache-key";
import { admitAiRequest } from "../src/lib/rate-limit";
import { normalizeProjectText } from "../src/lib/ai/input";
const event = (
  kind: LegalEvent["kind"],
  date: string,
  jurisdiction = "TR",
): LegalEvent => ({
  id: kind + date,
  kind,
  date,
  jurisdiction,
  description: { tr: kind, en: kind },
  source: "mock",
});
test("legal events sort chronologically without mutating the chain", () => {
  const events = [
    event("LAPSED", "2024-01-01"),
    event("GRANTED", "2020-01-01"),
  ];
  assert.equal(resolvePatentLegalStatus(events), LegalStatus.LAPSED);
  assert.equal(events[0].kind, "LAPSED");
});
test("reinstatement requires an earlier lapse", () => {
  assert.equal(
    resolvePatentLegalStatus([event("REINSTATED", "2024-01-01")]),
    LegalStatus.UNKNOWN,
  );
  assert.equal(
    resolvePatentLegalStatus([
      event("GRANTED", "2020-01-01"),
      event("LAPSED", "2023-01-01"),
      event("REINSTATED", "2024-01-01"),
    ]),
    LegalStatus.ACTIVE,
  );
});
test("mixed jurisdictions and conflicting events remain unknown", () => {
  assert.equal(
    resolvePatentLegalStatus([
      event("GRANTED", "2020-01-01", "TR"),
      event("EXPIRED", "2024-01-01", "DE"),
    ]),
    LegalStatus.UNKNOWN,
  );
  assert.equal(
    resolvePatentLegalStatus([
      event("GRANTED", "2020-01-01"),
      event("REVOKED", "2020-01-01"),
    ]),
    LegalStatus.UNKNOWN,
  );
  assert.equal(resolvePatentLegalStatus([]), LegalStatus.UNKNOWN);
});
test("renewal alone and unknown event do not imply active status", () => {
  assert.equal(
    resolvePatentLegalStatus([event("RENEWED", "2024-01-01")]),
    LegalStatus.UNKNOWN,
  );
  assert.equal(
    resolvePatentLegalStatus([
      event("GRANTED", "2020-01-01"),
      event("UNMAPPED", "2024-01-01"),
    ]),
    LegalStatus.UNKNOWN,
  );
});
test("all requested legal statuses have representative mock records", () => {
  assert.equal(mockPatents.length, 10);
  assert.deepEqual(
    new Set(mockPatents.map((p) => p.legalStatus)),
    new Set(Object.values(LegalStatus)),
  );
});
test("URL parsing accepts lowercase status and rejects invalid inputs", () => {
  assert.equal(
    searchSchema.parse({ status: "expired", year: "" }).status,
    LegalStatus.EXPIRED,
  );
  assert.equal(searchSchema.safeParse({ year: "banana" }).success, false);
  assert.equal(searchSchema.safeParse({ page: -1 }).success, false);
  assert.equal(searchSchema.safeParse({ status: "invented" }).success, false);
});
test("all filters compose, refresh inputs serialize, and sorting is stable", async () => {
  const p = new MockPatentProvider();
  const filters = searchSchema.parse({
    q: "robot",
    cpc: "B25J",
    ipc: "B25J",
    year: "2001",
    status: "expired",
    sort: "oldest",
  });
  const result = await p.searchPatents(filters);
  assert.equal(result.total, 1);
  assert.equal(result.patents[0].id, "orbit-002");
  assert.equal((await p.searchPatents({ ...filters, year: 2024 })).total, 0);
  const page1 = await p.searchPatents(searchSchema.parse({}));
  const page2 = await p.searchPatents(searchSchema.parse({ page: 2 }));
  assert.equal(page1.patents.length, 9);
  assert.equal(page2.patents.length, 1);
  assert.equal(
    new Set([...page1.patents, ...page2.patents].map((p) => p.id)).size,
    10,
  );
  assert.equal(await p.getPatentById("missing"), null);
});
test("smart cane description produces matching classifications and schema-valid estimates", async () => {
  const ai = new MockAiProvider();
  const intent = await ai.analyzeProjectIntent(
    "Titreşimle yönlendirme yapan, ToF sensörlü akıllı baston yapmak istiyorum.",
    "tr",
  );
  intentSchema.parse(intent);
  assert.ok(intent.suggestedCpc.includes("A61H3/06"));
  for (const p of mockPatents) {
    const b = await ai.estimateBuild(p, "tr");
    b.materials.forEach((item) => materialSchema.parse(item));
    assert.ok(b.cost.min <= b.cost.max);
    assert.ok(b.materials.length > 0);
  }
});
test("difficulty engine applies deterministic weighted average", () => {
  const result = calculateDifficulty({
    breakdown: {
      electronics: 10,
      software: 0,
      mechanical: 10,
      manufacturing: 0,
      testing: 10,
    },
    reasons: [],
  });
  assert.equal(result.overall, 6.5);
});
test("cost engine derives item subtotals and range", () => {
  const result = calculateCost(
    [
      {
        name: "Sensor",
        quantity: 2,
        estimatedUnitCost: 125,
        category: "sensors",
        reason: "Range",
        replacementFor: null,
      },
    ],
    ["Bench prototype"],
    "en",
  );
  assert.equal(result.items[0].subtotal, 250);
  assert.equal(result.min, 250);
  assert.equal(result.max, 313);
  assert.match(result.warning, /not a verified market price/);
});
test("relevance engine uses weighted, explainable signals", async () => {
  const ai = new MockAiProvider();
  const intent = await ai.analyzeProjectIntent(
    "ToF sensörlü titreşimli akıllı baston",
    "tr",
  );
  const matching = calculateRelevance(intent, mockPatents[0]);
  const unrelated = calculateRelevance(intent, mockPatents[5]);
  assert.ok(matching.score > unrelated.score);
  assert.ok(matching.score >= 40 && matching.score <= 100);
  assert.ok(matching.contributions.cpc > 0);
});
test("EPO query builder escapes CQL input and creates ranges", () => {
  const query = buildEpoQuery({
    q: 'robot" OR applicant=IBM',
    cpc: "b25j",
    ipc: undefined,
    year: 2024,
    status: undefined,
    sort: "newest",
    page: 2,
  });
  assert.match(query, /ta="robot OR applicant IBM"/);
  assert.doesNotMatch(query, /OR applicant=IBM/);
  assert.equal(
    buildEpoQuery({
      q: "robotic gripper",
      cpc: undefined,
      ipc: undefined,
      year: undefined,
      status: undefined,
      sort: "newest",
      page: 1,
    }),
    'ta="robotic gripper"',
  );
  assert.deepEqual(
    buildSearchParams(
      {
        q: "robot",
        cpc: undefined,
        ipc: undefined,
        year: undefined,
        status: undefined,
        sort: "newest",
        page: 2,
      },
      20,
    ),
    {
      q: 'ta="robot"',
      range: "21-40",
    },
  );
});
test("EPO identifiers separate route, EPODOC and DOCDB formats", () => {
  for (const [input, epodoc, docdb] of [
    ["EP1000000A1", "EP1000000", "EP.1000000.A1"],
    ["US6808849B2", "US6808849", "US.6808849.B2"],
    ["WO2024123456A1", "WO2024123456", "WO.2024123456.A1"],
  ] as const) {
    const parsed = parsePatentIdentifier(input);
    assert.ok(parsed);
    assert.equal(toEpodocIdentifier(parsed), epodoc);
    assert.equal(toDocdbIdentifier(parsed), docdb);
  }
  assert.equal(parsePatentIdentifier("../../secret"), null);
});
test("EPO parser normalizes multilingual namespace XML and missing fields", () => {
  const normal = parseEpoSearch(
    readFileSync("tests/fixtures/epo-normal.xml", "utf8"),
  );
  assert.equal(normal.total, 1);
  assert.equal(normal.patents[0].publicationNumber, "EP1234567A1");
  assert.equal(normal.patents[0].publicationDate, "2020-01-02");
  assert.deepEqual(normal.patents[0].inventors, [
    "Ada Lovelace",
    "Alan Turing",
  ]);
  assert.deepEqual(normal.patents[0].cpc, ["B25J15/12", "B25J15/14"]);
  assert.equal(
    normal.patents[0].abstract.en,
    "Force feedback controls the gripper.",
  );
  const missing = parseEpoSearch(
    readFileSync("tests/fixtures/epo-missing-abstract.xml", "utf8"),
  );
  assert.equal(missing.patents[0].abstract.en, "");
  const broken = parseEpoSearch(
    readFileSync("tests/fixtures/epo-broken.xml", "utf8"),
  );
  assert.equal(broken.patents[0].publicationNumber, "EP");
});
test("EPO search parser keeps publication-reference-only results", () => {
  const multiple = parseEpoSearch(
    readFileSync(
      "tests/fixtures/epo-search-publication-references.xml",
      "utf8",
    ),
  );
  assert.equal(multiple.total, 533255);
  assert.equal(multiple.patents.length, 2);
  assert.equal(multiple.patents[0].publicationNumber, "EP1234567A1");
  assert.equal(multiple.patents[0].title.en, "EP1234567A1");
  assert.equal(multiple.patents[0].abstract.en, "");
  assert.equal(multiple.diagnostics.publicationReferences, 2);
  assert.equal(multiple.diagnostics.opsPublicationReferences, 2);
  assert.equal(multiple.diagnostics.exchangeDocuments, 0);
});
test("EPO search parser accepts single-node and empty valid responses", () => {
  const single = parseEpoSearch(
    readFileSync("tests/fixtures/epo-search-single.xml", "utf8"),
  );
  assert.equal(single.total, 1);
  assert.equal(single.patents.length, 1);
  assert.equal(single.patents[0].publicationNumber, "EP7654321B1");
  const empty = parseEpoSearch(
    readFileSync("tests/fixtures/epo-search-empty.xml", "utf8"),
  );
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.patents, []);
});
test("EPO biblio parser returns null for empty response", () => {
  assert.equal(parseEpoBiblio("<world-patent-data />"), null);
});
test("EPO image availability handles no, single and multiple drawing pages", () => {
  const xml = readFileSync("tests/fixtures/epo-images.xml", "utf8");
  const multiple = parseEpoImageAvailability(xml);
  assert.deepEqual(multiple?.pages, [1, 2, 3, 4, 5]);
  assert.equal(multiple?.imageType, "thumbnail");
  const single = parseEpoImageAvailability(
    xml.replace(
      'number-of-pages="5" desc="Drawing"',
      'number-of-pages="1" desc="Drawing"',
    ),
  );
  assert.deepEqual(single?.pages, [1]);
  assert.equal(
    parseEpoImageAvailability(
      readFileSync("tests/fixtures/epo-images-none.xml", "utf8"),
    ),
    null,
  );
});
test("EPO drawing service rejects invalid pages and upstream content types", async () => {
  const service = new EpoImageService({
    request: async () => readFileSync("tests/fixtures/epo-images.xml", "utf8"),
    requestBinary: async () => ({
      body: new Uint8Array([1, 2, 3]),
      contentType: "text/html",
    }),
  });
  await assert.rejects(
    service.getDrawingPage("EP1234567A1", 0),
    /EPO_INVALID_DRAWING_PAGE/,
  );
  await assert.rejects(
    service.getDrawingPage("EP1234567A1", 1),
    /EPO_DRAWING_INVALID_CONTENT/,
  );
});
test("EPO auth caches a token and coalesces concurrent requests", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(
      JSON.stringify({ access_token: "test-token", expires_in: 3600 }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const auth = new EpoAuth("key", "secret");
    const tokens = await Promise.all([
      auth.getToken(),
      auth.getToken(),
      auth.getToken(),
    ]);
    assert.deepEqual(tokens, ["test-token", "test-token", "test-token"]);
    assert.equal(calls, 1);
    assert.equal(await auth.getToken(), "test-token");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("EPO provider normalizes client responses and caches identical searches", async () => {
  let calls = 0;
  const xml = readFileSync("tests/fixtures/epo-normal.xml", "utf8");
  const provider = new EpoOpsPatentProvider({
    request: async () => {
      calls++;
      return xml;
    },
  } as never);
  const query = {
    q: "robot",
    cpc: undefined,
    ipc: undefined,
    year: undefined,
    status: undefined,
    sort: "newest" as const,
    page: 1,
  };
  const first = await provider.searchPatents(query);
  const second = await provider.searchPatents(query);
  assert.equal(first.patents[0].publicationNumber, "EP1234567A1");
  assert.equal(second.total, 1);
  assert.equal(calls, 1);
});
test("EPO detail removes kind for EPODOC and uses controlled DOCDB fallback", async () => {
  const calls: string[] = [];
  const provider = new EpoOpsPatentProvider({
    request: async (path: string) => {
      calls.push(path);
      if (path.includes("/epodoc/"))
        throw new EpoOpsHttpError(
          404,
          "SERVER.EntityNotFound: No results found",
        );
      if (path.endsWith("/biblio"))
        return readFileSync("tests/fixtures/epo-biblio.xml", "utf8");
      throw new EpoOpsHttpError(503, "image metadata unavailable");
    },
  } as never);
  const patent = await provider.getPatentById("EP1234567A1");
  assert.equal(patent?.publicationNumber, "EP1234567A1");
  assert.deepEqual(patent?.cpc, ["B25J19/5"]);
  assert.equal(patent?.drawingStatus, "unavailable");
  assert.deepEqual(calls.slice(0, 2), [
    "published-data/publication/epodoc/EP1234567/biblio",
    "published-data/publication/docdb/EP.1234567.A1/biblio",
  ]);
});
test("EPO detail does not retry DOCDB after an upstream 5xx", async () => {
  let calls = 0;
  const provider = new EpoOpsPatentProvider({
    request: async () => {
      calls++;
      throw new EpoOpsHttpError(503, "service unavailable");
    },
  } as never);
  await assert.rejects(
    provider.getPatentById("EP1234567A1"),
    /EPO_UPSTREAM_UNAVAILABLE/,
  );
  assert.equal(calls, 1);
});
test("EPO detail exposes a safe failure after expected formats return 404", async () => {
  let calls = 0;
  const provider = new EpoOpsPatentProvider({
    request: async () => {
      calls++;
      throw new EpoOpsHttpError(404, "SERVER.EntityNotFound: No results found");
    },
  } as never);
  await assert.rejects(
    provider.getPatentById("EP1234567A1"),
    (error: unknown) =>
      error instanceof EpoOpsHttpError &&
      error.status === 404 &&
      error.message === "EPO_UPSTREAM_UNAVAILABLE",
  );
  assert.equal(calls, 2);
});
test("EPO detail keeps working when drawing metadata is empty", async () => {
  const provider = new EpoOpsPatentProvider({
    request: async (path: string) =>
      path.endsWith("/biblio")
        ? readFileSync("tests/fixtures/epo-biblio.xml", "utf8")
        : readFileSync("tests/fixtures/epo-images-none.xml", "utf8"),
  } as never);
  const patent = await provider.getPatentById("EP1234567A1");
  assert.equal(patent?.title.en, "Robotic gripper");
  assert.equal(patent?.drawingStatus, "none");
  assert.deepEqual(patent?.drawings, []);
});
test("AI cache coalesces calls and removes rejected values", async () => {
  const cache = new AsyncTtlCache();
  let calls = 0;
  const action = async () => ++calls;
  const [a, b] = await Promise.all([
    cache.getOrCreate("patent:1:cost", 1000, action),
    cache.getOrCreate("patent:1:cost", 1000, action),
  ]);
  assert.equal(a, 1);
  assert.equal(b, 1);
  assert.equal(calls, 1);
  await assert.rejects(
    cache.getOrCreate("bad", 1000, async () => {
      throw new Error("bad");
    }),
  );
  assert.equal(await cache.getOrCreate("bad", 1000, action), 2);
});
test("mock fallback is disabled in production", () => {
  assert.equal(allowsMockFallback("development"), true);
  assert.equal(allowsMockFallback("production"), false);
});
test("Zod rejects incomplete AI output", () => {
  assert.throws(() => intentSchema.parse({ keywords: ["robot"] }));
  assert.throws(() => materialSchema.parse({ name: "Sensor", quantity: 0 }));
});
test("cost values are finite, non-negative and ordered", () => {
  const result = calculateCost(
    [
      {
        name: "Unsafe input",
        quantity: Number.NaN,
        estimatedUnitCost: Number.POSITIVE_INFINITY,
        category: "other",
        reason: "Boundary test",
        replacementFor: null,
      },
    ],
    [],
    "tr",
  );
  const normalized = normalizeCost(
    { ...result, min: -10, max: -20, currency: "TRY" },
    "tr",
  );
  assert.ok(Number.isFinite(normalized.min));
  assert.ok(normalized.min >= 0);
  assert.ok(normalized.max >= normalized.min);
  assert.equal(normalized.currency, "TRY");
  assert.equal(
    normalized.warning,
    "Bu maliyet tahmini doğrulanmış piyasa fiyatı değildir.",
  );
});
test("difficulty and relevance clamp invalid numeric output", () => {
  const difficulty = normalizeDifficulty({
    breakdown: {
      electronics: Number.NaN,
      software: -5,
      mechanical: 50,
      manufacturing: 0,
      testing: 10,
    },
    overall: Number.POSITIVE_INFINITY,
    reasons: [],
  });
  assert.equal(difficulty.breakdown.electronics, 5);
  assert.equal(difficulty.breakdown.software, 0);
  assert.equal(difficulty.breakdown.mechanical, 10);
  assert.ok(difficulty.overall >= 0 && difficulty.overall <= 10);
  assert.equal(finiteClamp(Number.POSITIVE_INFINITY, 0, 100, 0), 0);
  assert.equal(finiteClamp(-12, 0, 100), 0);
  assert.equal(finiteClamp(120, 0, 100), 100);
});
test("missing patent fields use a locale-aware fallback", () => {
  const patent = {
    ...mockPatents[0],
    title: { tr: "", en: "English fallback" },
    abstract: { tr: "", en: "" },
    description: { tr: "", en: "" },
    inventors: [],
    applicants: [],
    cpc: [],
    ipc: [],
    priorityDate: "",
    legalEvents: [],
    drawings: [],
    family: [],
  };
  const display = patentDisplay(patent, "tr", "Veri mevcut değil");
  assert.equal(display.title, "English fallback");
  assert.equal(display.abstract, "Veri mevcut değil");
});
test("empty AI text falls back and long output is safely truncated", () => {
  const simplified = normalizeSimplification(
    {
      functionSummary: "   ",
      whyInterestingToday: "x".repeat(900),
      keyTechnicalIdea: "Idea",
      limitations: ["Same", "Same", ""],
    },
    "No data",
  );
  assert.equal(simplified.functionSummary, "No data");
  assert.ok(simplified.whyInterestingToday.length <= 500);
  assert.deepEqual(simplified.limitations, ["Same"]);
  assert.equal(safeText("x".repeat(100), "fallback", 20).length, 20);
});
test("duplicate modernization suggestions are removed and impacts clamped", () => {
  const items = normalizeModernization([
    {
      title: "Upgrade",
      description: "A",
      benefit: "B",
      difficultyImpact: 99,
      estimatedCostImpact: Number.NaN,
    },
    {
      title: " upgrade ",
      description: "C",
      benefit: "D",
      difficultyImpact: 0,
      estimatedCostImpact: 0,
    },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].difficultyImpact, 3);
  assert.equal(items[0].estimatedCostImpact, 0);
});
test("unsupported locale falls back to Turkish messages", async () => {
  const { isLocale, messages } = await import("../src/lib/i18n/messages");
  const locale = isLocale("de") ? "de" : "tr";
  assert.equal(locale, "tr");
  assert.equal(messages[locale].search, "Patent Ara");
});
test("Turkish and English message catalogs have matching keys", async () => {
  const { messages } = await import("../src/lib/i18n/messages");
  const keys = (value: object): string[] =>
    Object.entries(value).flatMap(([key, item]) =>
      typeof item === "object" && item !== null
        ? keys(item).map((child: string) => `${key}.${child}`)
        : [key],
    );
  assert.deepEqual(keys(messages.tr).sort(), keys(messages.en).sort());
});
test("discovery query preserves category, status, year, sort and page state", () => {
  const query = discoveryQuerySchema.parse({
    category: "robotics",
    status: "expired",
    year: "2000-2009",
    sort: "oldest",
    page: "2",
  });
  assert.deepEqual(query, {
    category: "robotics",
    status: LegalStatus.EXPIRED,
    year: "2000-2009",
    sort: "oldest",
    page: 2,
  });
});
test("mock discovery filters category, legal status and year ranges", async () => {
  const provider = new MockPatentProvider();
  const base = { sort: "featured" as const, page: 1, pageSize: 20 };
  const robotics = await provider.discoverPatents({
    ...base,
    category: "robotics",
  });
  assert.ok(robotics.patents.length > 0);
  assert.ok(
    robotics.patents.every((patent) => categorizePatent(patent) === "robotics"),
  );
  const expired = await provider.discoverPatents({
    ...base,
    legalStatus: LegalStatus.EXPIRED,
  });
  assert.ok(
    expired.patents.every(
      (patent) => patent.legalStatus === LegalStatus.EXPIRED,
    ),
  );
  const decade = await provider.discoverPatents({
    ...base,
    yearRange: yearRanges["2010-2019"],
  });
  assert.ok(
    decade.patents.every((patent) => {
      const year = Number(patent.publicationDate.slice(0, 4));
      return year >= 2010 && year <= 2019;
    }),
  );
});
test("featured, newest and oldest discovery sorting is deterministic", async () => {
  const provider = new MockPatentProvider();
  const base = { page: 1, pageSize: 20 };
  const featuredA = await provider.discoverPatents({
    ...base,
    sort: "featured",
  });
  const featuredB = await provider.discoverPatents({
    ...base,
    sort: "featured",
  });
  assert.deepEqual(
    featuredA.patents.map((patent) => patent.id),
    featuredB.patents.map((patent) => patent.id),
  );
  const newest = await provider.discoverPatents({ ...base, sort: "newest" });
  const oldest = await provider.discoverPatents({ ...base, sort: "oldest" });
  assert.equal(newest.patents[0].publicationDate, "2024-06-20");
  assert.equal(oldest.patents[0].publicationDate, "1999-06-20");
});
test("mock discovery paginates and can return an empty result", async () => {
  const provider = new MockPatentProvider();
  const page = await provider.discoverPatents({
    sort: "newest",
    page: 2,
    pageSize: 3,
  });
  assert.equal(page.patents.length, 3);
  assert.equal(page.pageSize, 3);
  const empty = await provider.discoverPatents({
    category: "assistive",
    legalStatus: LegalStatus.REVOKED,
    sort: "featured",
    page: 1,
    pageSize: 20,
  });
  assert.equal(empty.total, 0);
});
test("patent identifiers are detected while keyword searches use text matching", async () => {
  assert.equal(isPatentIdentifier("EP1000000A1"), true);
  assert.equal(isPatentIdentifier("US6808849"), true);
  assert.equal(isPatentIdentifier("robot kol"), false);
  const provider = new MockPatentProvider();
  const result = await provider.searchPatents(
    searchSchema.parse({ q: "robotic gripper" }),
  );
  assert.equal(result.patents[0].id, "orbit-002");
});
test("discover route is public and contains no auth dependency", () => {
  const source = readFileSync("src/app/[locale]/discover/page.tsx", "utf8");
  assert.match(source, /discoverPatents/);
  assert.doesNotMatch(source, /auth|session|user/i);
});
test("environment validation defaults to mock without requiring credentials", () => {
  const environment = validateEnvironment(
    {
      PATENT_PROVIDER: "mock",
      AI_PROVIDER: "mock",
      EPO_OPS_CONSUMER_KEY: "",
      EPO_OPS_CONSUMER_SECRET: "",
      OPENAI_API_KEY: "",
    },
    "production",
  );
  assert.equal(environment.valid, true);
  assert.deepEqual(resolveProviderModes(environment, "production"), {
    patent: "mock",
    ai: "mock",
  });
});
test("provider modes use development fallback and production unavailability", () => {
  const epoDev = validateEnvironment({ PATENT_PROVIDER: "epo" }, "development");
  assert.equal(resolveProviderModes(epoDev, "development").patent, "mock");
  const epoProduction = validateEnvironment(
    { PATENT_PROVIDER: "epo" },
    "production",
  );
  assert.equal(epoProduction.patentReady, false);
  assert.equal(
    resolveProviderModes(epoProduction, "production").patent,
    "unavailable",
  );
  const aiDev = validateEnvironment({ AI_PROVIDER: "openai" }, "development");
  assert.equal(resolveProviderModes(aiDev, "development").ai, "mock");
  const aiProduction = validateEnvironment(
    { AI_PROVIDER: "openai" },
    "production",
  );
  assert.equal(aiProduction.aiReady, false);
  assert.equal(
    resolveProviderModes(aiProduction, "production").ai,
    "unavailable",
  );
});
test("valid production credentials select configured providers without exposing values", () => {
  const environment = validateEnvironment(
    {
      PATENT_PROVIDER: "epo",
      EPO_OPS_CONSUMER_KEY: "private-key",
      EPO_OPS_CONSUMER_SECRET: "private-secret",
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "private-openai-key",
    },
    "production",
  );
  assert.equal(environment.valid, true);
  assert.deepEqual(resolveProviderModes(environment, "production"), {
    patent: "epo",
    ai: "openai",
  });
  assert.doesNotMatch(environment.issues.join(" "), /private/);
});
test("public errors never return provider or credential details", () => {
  const code = publicErrorCode(
    new Error("OAuth failed with secret private-key and raw XML"),
  );
  assert.equal(code, "SERVICE_UNAVAILABLE");
  assert.doesNotMatch(code, /OAuth|private|XML/);
});
test("metadata helpers create localized Open Graph values and safe URLs", () => {
  const tr = buildMetadata("tr");
  const en = buildMetadata("en", { title: "Discover", path: "/en/discover" });
  assert.equal(tr.title, seoCopy.tr.homeTitle);
  assert.equal(tr.openGraph?.locale, "tr_TR");
  assert.equal(en.openGraph?.locale, "en_US");
  assert.equal(
    siteUrl({ VERCEL_URL: "orbit.example.com" }).toString(),
    "https://orbit.example.com/",
  );
  assert.equal(
    siteUrl({ VERCEL_URL: "javascript:alert(1)" }).origin,
    "http://localhost:3000",
  );
  assert.equal(
    siteUrl({ NEXT_PUBLIC_APP_URL: "https://orbit.example.com" }).origin,
    "https://orbit.example.com",
  );
});
test("cache keys are stable across object key order and separate providers", () => {
  const first = stableCacheKey("search", {
    provider: "mock",
    page: 1,
    q: "robot",
  });
  const reordered = stableCacheKey("search", {
    q: "robot",
    page: 1,
    provider: "mock",
  });
  const otherProvider = stableCacheKey("search", {
    provider: "epo",
    page: 1,
    q: "robot",
  });
  assert.equal(first, reordered);
  assert.notEqual(first, otherProvider);
});
test("invalid patent identifiers are rejected before an EPO request", async () => {
  let calls = 0;
  const provider = new EpoOpsPatentProvider({
    request: async () => {
      calls++;
      return "";
    },
  } as never);
  await assert.rejects(
    provider.getPatentById("../../secret?token=1"),
    /EPO_INVALID_IDENTIFIER/,
  );
  assert.equal(calls, 0);
});
test("EPO client rejects a non-XML upstream response", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1)
      return new Response(
        JSON.stringify({ access_token: "token", expires_in: 3600 }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    return new Response("not xml", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }) as typeof fetch;
  try {
    await assert.rejects(
      new EpoOpsClient("key", "secret").request("published-data/search", {
        q: "ta=robot",
      }),
      /EPO_UPSTREAM_INVALID_CONTENT/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("hero copy is localized with the ORBIT design direction", async () => {
  const { messages } = await import("../src/lib/i18n/messages");
  assert.equal(
    messages.tr.headline,
    "Geçmişin fikirlerini keşfet. Geleceğin projelerini inşa et.",
  );
  assert.equal(
    messages.en.headline,
    "Discover ideas from the past. Build the projects of the future.",
  );
  assert.equal(
    messages.tr.intro,
    "Patentleri keşfedin, arayın veya yapmak istediğiniz projeyi ORBIT’e anlatın.",
  );
});

test("patent cards expose reusable selected and accessible focus states", () => {
  const wrapper = readFileSync(
    "src/components/ui/expanding-patent-card.tsx",
    "utf8",
  );
  const patentCard = readFileSync(
    "src/components/patents/patent-card.tsx",
    "utf8",
  );
  const projectSearch = readFileSync(
    "src/components/ai/project-search.tsx",
    "utf8",
  );
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.match(wrapper, /data-selected/);
  assert.match(patentCard, /aria-pressed=\{selected\}/);
  assert.match(projectSearch, /selectedPatentId/);
  assert.match(css, /\.expanding-patent-card:focus-within/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(projectSearch + wrapper, /pointermove/i);
});

test("AI rate limiter is per client in production and open in development", () => {
  const ip = `192.0.2.${Date.now() % 200}`;
  const request = () =>
    new Request("http://orbit.test/api/ai", {
      headers: { "x-forwarded-for": ip },
    });
  assert.equal(admitAiRequest(request(), "development"), true);
  for (let index = 0; index < 20; index++)
    assert.equal(admitAiRequest(request(), "production"), true);
  assert.equal(admitAiRequest(request(), "production"), false);
  assert.equal(
    admitAiRequest(
      new Request("http://orbit.test/api/ai", {
        headers: { "x-forwarded-for": `${ip}-other` },
      }),
      "production",
    ),
    true,
  );
});

test("release boundary routes stay public and do not expose secrets", () => {
  const health = readFileSync("src/app/api/health/route.ts", "utf8");
  const notFound = readFileSync("src/app/not-found.tsx", "utf8");
  assert.match(health, /status: "ok"/);
  assert.doesNotMatch(health, /SECRET|KEY|TOKEN/i);
  assert.match(notFound, /ORBIT \/ 404/);
});

test("provider labels separate live AI from sample patent data", async () => {
  const { messages } = await import("../src/lib/i18n/messages");
  assert.equal(messages.tr.mock, "Patent verisi örnektir.");
  assert.equal(messages.tr.live, "Patent verisi canlıdır.");
  assert.equal(messages.tr.aiMock, "AI analizi örnektir.");
  assert.equal(messages.tr.aiLive, "AI analizi canlıdır.");
  assert.match(messages.tr.patentDemo, /demo\/test/);
  assert.deepEqual(
    [
      messages.tr.mock,
      messages.tr.live,
      messages.tr.aiMock,
      messages.tr.aiLive,
    ].map((value) => typeof value),
    ["string", "string", "string", "string"],
  );
});

test("AI project input collapses whitespace and repeated adjacent words", () => {
  assert.equal(
    normalizeProjectText("  ToF   ToF sensörlü   baston baston  "),
    "ToF sensörlü baston",
  );
});

test("detail UI keeps tables scrollable and modernization impacts labeled", () => {
  const source = readFileSync("src/app/[locale]/patents/[id]/page.tsx", "utf8");
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.match(source, /materials-table/);
  assert.match(source, /difficultyImpact/);
  assert.match(source, /costImpact/);
  assert.match(css, /min-width: 680px/);
  assert.match(css, /difficulty-progress\.difficulty-medium/);
});

test("editorial patent presentation keeps drawing viewer and home steps accessible", () => {
  const viewer = readFileSync(
    "src/components/patents/patent-drawing-viewer.tsx",
    "utf8",
  );
  const detail = readFileSync("src/app/[locale]/patents/[id]/page.tsx", "utf8");
  const home = readFileSync("src/app/[locale]/page.tsx", "utf8");
  const discover = readFileSync(
    "src/components/patents/discover-card.tsx",
    "utf8",
  );
  assert.match(viewer, /aria-current/);
  assert.match(viewer, /type="button"/);
  assert.match(viewer, /loading="lazy"/);
  assert.match(detail, /PatentDrawingViewer/);
  assert.match(detail, /detail-hero/);
  assert.match(home, /howItWorks/);
  assert.match(home, /howDiscover/);
  assert.match(discover, /source-badge/);
});

test("drawing proxy and detail error UI keep upstream details private", () => {
  const proxy = readFileSync(
    "src/app/api/patents/[id]/drawings/[page]/route.ts",
    "utf8",
  );
  const errorUi = readFileSync(
    "src/app/[locale]/patents/[id]/error.tsx",
    "utf8",
  );
  assert.match(proxy, /drawingPage/);
  assert.match(proxy, /X-Content-Type-Options/);
  assert.match(proxy, /SERVICE_UNAVAILABLE/);
  assert.doesNotMatch(proxy, /CONSUMER|Authorization|access_token/);
  assert.match(errorUi, /m\.patentUnavailable/);
  assert.match(errorUi, /m\.retry/);
  assert.match(errorUi, /m\.back/);
});
