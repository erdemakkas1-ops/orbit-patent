import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
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
import {
  formatPublicationNumber,
  readableTitle,
} from "../src/lib/patents/format";
import {
  intentSchema,
  materialSchema,
  patentTranslationBatchSchema,
} from "../src/types/ai";
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
  hydratePatentReferences,
} from "../src/lib/patents/providers/epo";
import {
  parsePatentIdentifier,
  toDocdbIdentifier,
  toEpodocIdentifier,
} from "../src/lib/patents/providers/epo/identifier";
import {
  CARD_TRIM_THRESHOLD,
  EpoImageService,
  parseEpoImageAvailability,
  trimPatentDrawingForCard,
  renderCardDrawing,
  CARD_RENDER_BOX,
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
import {
  CARD_DRAWING_VERSION,
  cardDrawingUrl,
} from "../src/lib/patents/drawing-url";
import { admitAiRequest } from "../src/lib/rate-limit";
import { normalizeProjectText } from "../src/lib/ai/input";
import {
  clearTranslationCacheForTests,
  localizePatentsWithProvider,
  patentTranslationCacheKey,
} from "../src/lib/ai/translation-core";
import { AiCreditCircuit, safeAiErrorDetails } from "../src/lib/ai/error-log";
import {
  mapEpoLegalEvent,
  parseEpoFamilyLegal,
} from "../src/lib/patents/providers/epo/family";
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
  assert.equal(
    buildEpoQuery({
      anyTerms: ["robot", "gripper", "manipulator"],
      yearRange: { from: 2010, to: 2019 },
      sort: "relevance",
      page: 1,
    }),
    '(ta="robot" OR ta="gripper" OR ta="manipulator") AND publicationdate within "20100101,20191231"',
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
test("EPO parser preserves real language variants without copying English into Turkish", () => {
  const result = parseEpoBiblio(`
    <world-patent-data><exchange-documents><exchange-document>
      <bibliographic-data>
        <publication-reference><document-id document-id-type="docdb"><country>EP</country><doc-number>42</doc-number><kind>A1</kind></document-id></publication-reference>
        <invention-title lang="en">Smart gripper</invention-title>
        <invention-title lang="tr">Akıllı tutucu</invention-title>
      </bibliographic-data>
      <abstract lang="en"><p>Force feedback.</p></abstract>
      <abstract lang="tr"><p>Kuvvet geri bildirimi.</p></abstract>
    </exchange-document></exchange-documents></world-patent-data>`);
  assert.equal(result?.title.en, "Smart gripper");
  assert.equal(result?.title.tr, "Akıllı tutucu");
  assert.equal(result?.abstract.en, "Force feedback.");
  assert.equal(result?.abstract.tr, "Kuvvet geri bildirimi.");
  assert.doesNotMatch(result?.abstract.en ?? "", /en|lang/);

  const englishOnly = parseEpoBiblio(`
    <world-patent-data><exchange-documents><exchange-document>
      <bibliographic-data>
        <publication-reference><document-id document-id-type="docdb"><country>EP</country><doc-number>43</doc-number><kind>A1</kind></document-id></publication-reference>
        <invention-title lang="en">Original title</invention-title>
      </bibliographic-data>
      <abstract lang="en"><p>Original abstract.</p></abstract>
    </exchange-document></exchange-documents></world-patent-data>`);
  assert.equal(englishOnly?.title.en, "Original title");
  assert.equal(englishOnly?.title.tr, "");
  assert.equal(englishOnly?.abstract.tr, "");
});
test("EPO parser keeps CPC leading zeros and lists each party once", () => {
  const result = parseEpoBiblio(`
    <world-patent-data><exchange-documents><exchange-document>
      <bibliographic-data>
        <publication-reference><document-id document-id-type="docdb"><country>US</country><doc-number>20260295860</doc-number><kind>A1</kind></document-id></publication-reference>
        <parties>
          <applicants>
            <applicant sequence="1" data-format="epodoc"><applicant-name><name>BOSTON DYNAMICS INC [US]</name></applicant-name></applicant>
            <applicant sequence="1" data-format="original"><applicant-name><name>Boston Dynamics, Inc.</name></applicant-name></applicant>
          </applicants>
          <inventors>
            <inventor sequence="1" data-format="epodoc"><inventor-name><name>TAYLOR IAN [US]</name></inventor-name></inventor>
            <inventor sequence="1" data-format="original"><inventor-name><name>Taylor, Ian</name></inventor-name></inventor>
          </inventors>
        </parties>
        <patent-classifications>
          <patent-classification>
            <classification-scheme scheme="CPCI" />
            <section>B</section><class>25</class><subclass>J</subclass>
            <main-group>13</main-group><subgroup>084</subgroup>
          </patent-classification>
        </patent-classifications>
        <invention-title lang="en">ROBOTIC FOOT SENSOR</invention-title>
      </bibliographic-data>
    </exchange-document></exchange-documents></world-patent-data>`);
  assert.deepEqual(result?.cpc, ["B25J13/084"]);
  assert.deepEqual(result?.applicants, ["Boston Dynamics, Inc."]);
  assert.deepEqual(result?.inventors, ["Taylor, Ian"]);
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
  assert.equal(categorizePatent(multiple.patents[0]), null);
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
test("card drawing variant trims white and near-white margins conservatively", async () => {
  for (const background of [255, 246]) {
    const original = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: { r: background, g: background, b: background },
      },
    })
      .composite([
        {
          input: {
            create: {
              width: 120,
              height: 80,
              channels: 3,
              background: { r: 35, g: 35, b: 35 },
            },
          },
          left: 140,
          top: 110,
        },
      ])
      .png()
      .toBuffer();
    const card = await trimPatentDrawingForCard(original);
    const metadata = await sharp(card).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.width, 136);
    assert.equal(metadata.height, 96);
  }
  assert.equal(CARD_TRIM_THRESHOLD, 18);
});
test("card drawing trim falls back when the detected content is suspiciously tiny", async () => {
  const original = await sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      {
        input: {
          create: {
            width: 4,
            height: 4,
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
          },
        },
        left: 198,
        top: 148,
      },
    ])
    .png()
    .toBuffer();
  const card = await trimPatentDrawingForCard(original);
  assert.equal(Buffer.from(card).equals(original), true);
});
test("card drawing trim excludes a separated standard page header", async () => {
  const original = await sharp({
    create: {
      width: 400,
      height: 600,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      {
        input: {
          create: {
            width: 250,
            height: 20,
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
          },
        },
        left: 75,
        top: 25,
      },
      {
        input: {
          create: {
            width: 220,
            height: 300,
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
          },
        },
        left: 90,
        top: 180,
      },
    ])
    .png()
    .toBuffer();
  const card = await trimPatentDrawingForCard(original);
  const metadata = await sharp(card).metadata();
  assert.equal(metadata.width, 236);
  assert.equal(metadata.height, 316);
});
test("card drawing trim keeps a narrow figure label at the top", async () => {
  const original = await sharp({
    create: { width: 400, height: 600, channels: 3, background: "#ffffff" },
  })
    .composite([
      {
        input: { create: { width: 60, height: 16, channels: 3, background: "#000000" } },
        left: 40,
        top: 25,
      },
      {
        input: { create: { width: 220, height: 300, channels: 3, background: "#000000" } },
        left: 90,
        top: 180,
      },
    ])
    .png()
    .toBuffer();
  const card = await trimPatentDrawingForCard(original);
  const metadata = await sharp(card).metadata();
  assert.equal(metadata.height, 471); // label at 25 through the drawing at 480, + borders
});
test("card drawing trim ignores a scanner line along the page edge", async () => {
  const original = await sharp({
    create: { width: 1000, height: 1400, channels: 3, background: "#ffffff" },
  })
    .composite([
      {
        input: { create: { width: 3, height: 1200, channels: 3, background: "#000000" } },
        left: 978,
        top: 100,
      },
      {
        input: { create: { width: 400, height: 500, channels: 3, background: "#000000" } },
        left: 300,
        top: 450,
      },
    ])
    .png()
    .toBuffer();
  const card = await trimPatentDrawingForCard(original);
  const metadata = await sharp(card).metadata();
  assert.equal(metadata.width, 416);
  assert.equal(metadata.height, 516);
});
test("card drawing render fits the card box as lossless PNG", async () => {
  const page = await sharp({
    create: { width: 2550, height: 3300, channels: 3, background: "#ffffff" },
  })
    .composite([
      {
        input: { create: { width: 2000, height: 2, channels: 3, background: "#000000" } },
        left: 200,
        top: 1600,
      },
    ])
    .png()
    .toBuffer();
  const card = await renderCardDrawing(page);
  const metadata = await sharp(card).metadata();
  assert.equal(metadata.format, "png");
  assert.ok((metadata.width ?? 0) <= CARD_RENDER_BOX.width);
  assert.equal(metadata.height, CARD_RENDER_BOX.height);
  // the 2px stroke survives the ~6x downscale as a dark line
  const { data, info } = await sharp(card)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let darkest = 255;
  for (let i = 0; i < info.width * info.height; i++)
    darkest = Math.min(darkest, data[i]);
  assert.ok(darkest < 90, `darkest pixel ${darkest}`);
});
test("card and full drawing variants share one upstream page and cache separately", async () => {
  const tiff = await sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      {
        input: {
          create: {
            width: 160,
            height: 100,
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
          },
        },
        left: 120,
        top: 100,
      },
    ])
    .tiff()
    .toBuffer();
  let binaryCalls = 0;
  const service = new EpoImageService({
    request: async () => readFileSync("tests/fixtures/epo-images.xml", "utf8"),
    requestBinary: async () => {
      binaryCalls++;
      return { body: new Uint8Array(tiff), contentType: "application/tiff" };
    },
  });
  const full = await service.getDrawingPage("EP1234567A1", 1, "full");
  const card = await service.getDrawingPage("EP1234567A1", 1, "card");
  assert.equal(binaryCalls, 1);
  const fullMetadata = await sharp(full.body).metadata();
  assert.equal(fullMetadata.format, "png");
  assert.equal(fullMetadata.width, 400);
  assert.equal(fullMetadata.height, 300);
  const cardMetadata = await sharp(card.body).metadata();
  assert.equal(cardMetadata.format, "png");
  assert.ok((cardMetadata.width ?? 400) < 400);
  assert.ok((cardMetadata.height ?? 300) < 300);
  assert.equal(await service.getDrawingPage("EP1234567A1", 1, "full"), full);
  assert.equal(await service.getDrawingPage("EP1234567A1", 1, "card"), card);
  assert.equal(binaryCalls, 1);
});
test("card drawing URLs use a stable cache version without changing static assets", () => {
  assert.equal(CARD_DRAWING_VERSION, "5");
  assert.equal(
    cardDrawingUrl("/api/patents/EP123A1/drawings/1"),
    "/api/patents/EP123A1/drawings/1?variant=card&v=5",
  );
  assert.equal(cardDrawingUrl("/drawings/mock.svg"), "/drawings/mock.svg");
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
test("EPO discovery maps categories and years to one cached OPS search", async () => {
  const requests: Array<{
    path: string;
    params?: Record<string, string>;
    range?: string;
  }> = [];
  const xml = readFileSync(
    "tests/fixtures/epo-search-publication-references.xml",
    "utf8",
  );
  const provider = new EpoOpsPatentProvider({
    request: async (
      path: string,
      params?: Record<string, string>,
      range?: string,
    ) => {
      requests.push({ path, params, range });
      return xml;
    },
  } as never);
  const hydratedIds: string[] = [];
  provider.getPatentById = async (id: string) => {
    hydratedIds.push(id);
    return {
      ...mockPatents[0],
      id,
      publicationNumber: id,
      title: { tr: `Hydrated ${id}`, en: `Hydrated ${id}` },
      abstract: { tr: "Gerçek özet", en: "Real abstract" },
      publicationDate: "2018-05-06",
      drawings: [
        {
          url: `/api/patents/${id}/drawings/1`,
          caption: { tr: "Çizim", en: "Drawing" },
        },
      ],
      source: "epo",
    };
  };
  const filters = {
    category: "robotics" as const,
    yearRange: { from: 2010, to: 2019 },
    sort: "newest" as const,
    page: 2,
    pageSize: 6,
  };
  const first = await provider.discoverPatents(filters);
  const second = await provider.discoverPatents(filters);
  assert.equal(first.patents[0].publicationNumber, "EP1234567A1");
  assert.equal(first.patents[0].title.en, "Hydrated EP1234567A1");
  assert.equal(first.patents[0].abstract.en, "Real abstract");
  assert.equal(first.patents[0].publicationDate, "2018-05-06");
  assert.equal(first.patents[0].drawings.length, 1);
  assert.equal(second.source, "epo");
  assert.deepEqual(hydratedIds, ["EP1234567A1", "WO2024000001A1"]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, "published-data/search");
  assert.equal(requests[0].range, "7-12");
  assert.equal(
    requests[0].params?.q,
    '(ta="robot" OR ta="gripper" OR ta="manipulator") AND publicationdate within "20100101,20191231"',
  );
  await assert.rejects(
    provider.discoverPatents({
      ...filters,
      legalStatus: LegalStatus.ACTIVE,
    }),
    /EPO_LEGAL_STATUS_FILTER_UNAVAILABLE/,
  );
});
test("EPO featured patents use one deterministic cached search", async () => {
  let calls = 0;
  const xml = readFileSync(
    "tests/fixtures/epo-search-publication-references.xml",
    "utf8",
  );
  const provider = new EpoOpsPatentProvider({
    request: async () => {
      calls++;
      return xml;
    },
  } as never);
  provider.getPatentById = async (id: string) => ({
    ...mockPatents[0],
    id,
    publicationNumber: id,
    source: "epo",
  });
  const first = await provider.getFeaturedPatents(3);
  const second = await provider.getFeaturedPatents(3);
  assert.deepEqual(
    first.map((patent) => patent.id),
    second.map((patent) => patent.id),
  );
  assert.equal(calls, 1);
  assert.deepEqual(await provider.getFeaturedPatents(0), []);
  assert.equal(calls, 1);
});
test("EPO hydration bounds concurrency, removes duplicates and survives failures", async () => {
  const references = ["EP1A1", "EP2A1", "EP2A1", "EP3A1", "EP4A1"].map(
    (id) => ({
      ...mockPatents[0],
      id,
      publicationNumber: id,
      source: "epo" as const,
    }),
  );
  let active = 0;
  let maxActive = 0;
  const calls: string[] = [];
  const hydrated = await hydratePatentReferences(
    references,
    async (id) => {
      calls.push(id);
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      if (id === "EP3A1") throw new Error("single detail failure");
      return {
        ...mockPatents[0],
        id,
        publicationNumber: id,
        title: { tr: `Hydrated ${id}`, en: `Hydrated ${id}` },
        source: "epo" as const,
      };
    },
    4,
    10,
  );
  assert.equal(maxActive, 3);
  assert.deepEqual(calls, ["EP1A1", "EP2A1", "EP3A1", "EP4A1"]);
  assert.deepEqual(
    hydrated.map((patent) => patent.id),
    ["EP1A1", "EP2A1", "EP4A1"],
  );
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
test("EPO detail reports a missing patent after expected formats return 404", async () => {
  let calls = 0;
  const provider = new EpoOpsPatentProvider({
    request: async () => {
      calls++;
      throw new EpoOpsHttpError(404, "SERVER.EntityNotFound: No results found");
    },
  } as never);
  assert.equal(await provider.getPatentById("EP1234567A1"), null);
  assert.equal(calls, 2);
});
test("EPO search treats a 404 'No results found' as an empty result", async () => {
  const provider = new EpoOpsPatentProvider({
    request: async () => {
      throw new EpoOpsHttpError(404, "SERVER.EntityNotFound: No results found");
    },
  } as never);
  const result = await provider.searchPatents({
    q: "no such words",
    sort: "relevance",
    page: 1,
  });
  assert.equal(result.total, 0);
  assert.deepEqual(result.patents, []);
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
test("translation structured output validates indexes and text", () => {
  assert.equal(
    patentTranslationBatchSchema.parse({
      items: [
        {
          index: 0,
          title: "Başlık",
          abstract: "Özet",
          description: "Açıklama",
        },
      ],
    }).items[0].title,
    "Başlık",
  );
  assert.throws(() =>
    patentTranslationBatchSchema.parse({ items: [{ index: -1, title: "" }] }),
  );
});
test("Turkish patent localization batches cache misses and reuses per-patent cache", async () => {
  clearTranslationCacheForTests();
  let calls = 0;
  let batchSize = 0;
  const provider = {
    source: "openai" as const,
    model: "gpt-4.1-mini",
    async translatePatentTexts(items: unknown[]) {
      calls += 1;
      batchSize = items.length;
      return items.map((_item, index) => ({
        index,
        title: `Türkçe ${index}`,
        abstract: `Özet ${index}`,
        description: `Açıklama ${index}`,
      }));
    },
  };
  const patents = mockPatents.slice(0, 2).map((patent, index) => ({
    ...patent,
    publicationNumber: `CACHE-${index}`,
    title: { tr: "", en: `English ${index}` },
    abstract: { tr: "", en: `Abstract ${index}` },
    description: { tr: "", en: `Description ${index}` },
  }));
  const first = await localizePatentsWithProvider(patents, "tr", provider);
  const second = await localizePatentsWithProvider(patents, "tr", provider);
  assert.equal(calls, 1);
  assert.equal(batchSize, 2);
  assert.equal(first[1].translations?.tr?.title, "Türkçe 1");
  assert.equal(second[0].translations?.tr?.abstract, "Özet 0");
  assert.equal(patents[0].title.en, "English 0");
  assert.equal(patents[0].translations, undefined);
});
test("translation failure falls back to original source and cache keys include model and source hash", async () => {
  clearTranslationCacheForTests();
  const patent = {
    ...mockPatents[0],
    publicationNumber: "FALLBACK-1",
    title: { tr: "", en: "Original" },
    abstract: { tr: "", en: "Original abstract" },
    description: { tr: "", en: "Original description" },
  };
  const failing = {
    source: "openai" as const,
    model: "gpt-4.1-mini",
    async translatePatentTexts() {
      throw new Error("upstream unavailable");
    },
  };
  const localized = await localizePatentsWithProvider([patent], "tr", failing);
  assert.equal(localized[0], patent);
  assert.notEqual(
    patentTranslationCacheKey(patent, "tr", failing),
    patentTranslationCacheKey(
      { ...patent, title: { ...patent.title, en: "Changed" } },
      "tr",
      failing,
    ),
  );
  assert.notEqual(
    patentTranslationCacheKey(patent, "tr", failing),
    patentTranslationCacheKey(patent, "tr", { ...failing, model: "other" }),
  );
});
test("display prefers real Turkish, then cached translation, while English stays original", () => {
  const patent = {
    ...mockPatents[0],
    title: { tr: "Gerçek Türkçe", en: "Original English" },
    abstract: { tr: "", en: "Original abstract" },
    description: { tr: "", en: "Original description" },
    translations: {
      tr: {
        title: "Translated title",
        abstract: "Çevrilmiş özet",
        description: "Çevrilmiş açıklama",
      },
    },
  };
  assert.equal(patentDisplay(patent, "tr", "Yok").title, "Gerçek Türkçe");
  assert.equal(patentDisplay(patent, "tr", "Yok").abstract, "Çevrilmiş özet");
  assert.equal(patentDisplay(patent, "en", "None").title, "Original English");
});
test("safe AI logs redact credentials and keep diagnostic fields", () => {
  const error = Object.assign(new Error("Invalid key sk-supersecret123456"), {
    status: 401,
    code: "invalid_api_key",
    request_id: "req_123",
  });
  const details = safeAiErrorDetails(
    error,
    "project_intent",
    "gpt-4.1-mini",
    12,
  );
  assert.equal(details.status, 401);
  assert.equal(details.code, "invalid_api_key");
  assert.equal(details.requestId, "req_123");
  assert.doesNotMatch(JSON.stringify(details), /supersecret/);
});
test("AI credit circuit fails fast for a bounded cooldown and can recover", () => {
  const circuit = new AiCreditCircuit(1000);
  circuit.observe({ code: "credit_balance_exhausted" }, 100);
  assert.throws(() => circuit.assertAvailable(500), /AI_CREDIT_EXHAUSTED/);
  assert.doesNotThrow(() => circuit.assertAvailable(1101));
});
test("AI credit circuit coalesces the first request while credit is unknown", async () => {
  const circuit = new AiCreditCircuit(1000);
  const releaseProbe = await circuit.enter();
  let waiting = true;
  const second = circuit.enter().finally(() => {
    waiting = false;
  });
  await Promise.resolve();
  assert.equal(waiting, true);
  circuit.observe({ code: "credit_balance_exhausted" });
  releaseProbe();
  await assert.rejects(second, /AI_CREDIT_EXHAUSTED/);
});
test("EPO family/legal parser deduplicates members and maps only conservative events", () => {
  const parsed = parseEpoFamilyLegal(
    `<ops:world-patent-data xmlns:ops="x"><ops:patent-family><ops:family-member><publication-reference><document-id document-id-type="docdb"><country>EP</country><doc-number>1000000</doc-number><kind>A1</kind></document-id></publication-reference><ops:legal code="FG" desc="GRANT OF PATENT"><ops:L001EP desc="Country Code">EP</ops:L001EP><ops:L007EP desc="Gazette DATE">2003-08-15</ops:L007EP></ops:legal></ops:family-member><ops:family-member><publication-reference><document-id document-id-type="docdb"><country>EP</country><doc-number>1000000</doc-number><kind>A1</kind></document-id></publication-reference><ops:legal code="AX" desc="DESIGNATED CONTRACTING STATES"><ops:L001EP desc="Country Code">EP</ops:L001EP><ops:L007EP desc="Gazette DATE">2004-01-02</ops:L007EP></ops:legal></ops:family-member></ops:patent-family></ops:world-patent-data>`,
  );
  assert.deepEqual(parsed.family, [
    { publicationNumber: "EP1000000A1", country: "EP" },
  ]);
  assert.equal(parsed.legalEvents[0].kind, "GRANTED");
  assert.equal(parsed.legalEvents[1].kind, "UNMAPPED");
  assert.equal(mapEpoLegalEvent("RER", "CEASED AS TO NATIONAL LAW"), "LAPSED");
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

test("patent cards expose one accessible full-card link", () => {
  const wrapper = readFileSync(
    "src/components/ui/expanding-patent-card.tsx",
    "utf8",
  );
  const patentCard = readFileSync(
    "src/components/patents/patent-specimen.tsx",
    "utf8",
  );
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.match(wrapper, /<Link className="patent-card-link"/);
  assert.match(wrapper, /href=\{href\}/);
  assert.match(wrapper, /aria-label=\{ariaLabel\}/);
  assert.doesNotMatch(patentCard, /<Link|<button|m\.details/);
  assert.match(patentCard, /specimen-plate/);
  assert.match(patentCard, /cardDrawingUrl\(drawing\.url\)/);
  assert.match(css, /\.expanding-patent-card:focus-within/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(wrapper, /pointermove/i);
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
  const source = [
    readFileSync("src/app/[locale]/patents/[id]/page.tsx", "utf8"),
    readFileSync("src/components/patents/patent-analysis.tsx", "utf8"),
  ].join("\n");
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.match(source, /materials-table/);
  assert.match(source, /difficultyImpact/);
  assert.match(source, /costImpact/);
  assert.match(css, /min-width: 680px/);
  assert.match(css, /difficulty-progress\.difficulty-medium/);
});
test("detail shell streams AI and legal metadata instead of awaiting them", () => {
  const source = readFileSync("src/app/[locale]/patents/[id]/page.tsx", "utf8");
  assert.match(source, /<Suspense/);
  assert.match(source, /PatentAnalysisLoading/);
  assert.doesNotMatch(source, /await analyzePatent/);
  assert.doesNotMatch(source, /await localizePatents/);
});

test("editorial patent presentation keeps drawing viewer and home steps accessible", () => {
  const viewer = readFileSync(
    "src/components/patents/patent-drawing-viewer.tsx",
    "utf8",
  );
  const detail = readFileSync("src/app/[locale]/patents/[id]/page.tsx", "utf8");
  const home = readFileSync("src/app/[locale]/page.tsx", "utf8");
  const discover = readFileSync(
    "src/components/patents/patent-specimen.tsx",
    "utf8",
  );
  assert.match(viewer, /aria-current/);
  assert.match(viewer, /type="button"/);
  assert.match(viewer, /loading="lazy"/);
  assert.match(detail, /PatentDrawingViewer/);
  assert.match(detail, /detail-hero/);
  assert.match(home, /howItWorks/);
  assert.match(home, /howDiscover/);
  assert.match(discover, /specimen-source/);
  assert.match(discover, /specimen-status/);
});

test("homepage featured patents reuse localization and card thumbnails", () => {
  const home = readFileSync("src/app/[locale]/page.tsx", "utf8");
  const card = readFileSync(
    "src/components/patents/patent-specimen.tsx",
    "utf8",
  );
  const viewer = readFileSync(
    "src/components/patents/patent-drawing-viewer.tsx",
    "utf8",
  );
  assert.match(home, /localizePatents\(rawFeatured, locale\)/);
  assert.match(home, /<FeaturedPatentCards locale={locale} \/>/);
  assert.match(home, /<Suspense/);
  assert.match(card, /cardDrawingUrl\(drawing\.url\)/);
  assert.match(card, /className="specimen-drawing"/);
  assert.doesNotMatch(card, /m\.inspect|<Link/);
  assert.doesNotMatch(viewer, /cardDrawingUrl|variant=card/);
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

test("patent cards format publication numbers and shouting titles", () => {
  assert.equal(formatPublicationNumber("US7182230B2"), "US 7,182,230 B2");
  assert.equal(formatPublicationNumber("US20260295860A1"), "US 2026/0295860 A1");
  assert.equal(formatPublicationNumber("EP1234567A1"), "EP 1234567 A1");
  assert.equal(formatPublicationNumber("WO-odd"), "WO-odd");
  assert.equal(readableTitle("ROBOTIC FOOT SENSOR", "en"), "Robotic foot sensor");
  assert.equal(readableTitle("İKİ IŞIKLI LAMBA", "tr"), "İki ışıklı lamba");
  assert.equal(
    readableTitle("PIL ENERJI DEPOLAMA SISTEMI", "tr"),
    "Pil enerji depolama sistemi",
  );
  assert.equal(readableTitle("Robot system", "en"), "Robot system");
});

test("Turkish project intents rank English patents through the English queries", () => {
  const intent = {
    summary: "Kediler için zamanlayıcılı mama makinesi",
    keywords: ["kedi", "mama", "zamanlayıcı"],
    concepts: ["otomatik besleme"],
    suggestedCpc: [],
    suggestedIpc: [],
    searchQueries: ["automatic pet feeder", "timed food dispenser"],
    technicalDomains: [],
  };
  const withTitle = (title: string, abstract: string) => ({
    ...mockPatents[0],
    title: { tr: "", en: title },
    abstract: { tr: "", en: abstract },
  });
  const feeder = calculateRelevance(
    intent,
    withTitle(
      "Self-cleaning automatic cat feeder",
      "A feeder dispenses food on a timer.",
    ),
  );
  const cabin = calculateRelevance(
    intent,
    withTitle("Working dog life support cabin", "A cabin keeps a dog warm."),
  );
  assert.ok(feeder.score > cabin.score);
  assert.equal(feeder.contributions.keyword, 0.5); // (2/3 + 1/3) / 2
});
