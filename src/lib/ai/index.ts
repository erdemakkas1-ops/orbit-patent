import "server-only";
import { MockAiProvider } from "./mock";
import { OpenAiProvider } from "./openai";
import type { Locale, Patent, PatentClaim } from "@/types/patent";
import type { AiProvider } from "./provider";
import type {
  Analysis,
  ClaimScope,
  DevelopmentDirection,
  DevelopmentHypothesis,
  ProjectIntent,
} from "@/types/ai";
import { AsyncTtlCache, allowsMockFallback } from "./cache";
import { providerModes, serverEnv } from "@/lib/env";
import { stableCacheKey } from "@/lib/cache-key";
import { durableGet, durableSet } from "@/lib/durable-cache";
const mock = new MockAiProvider();
class UnavailableAiProvider implements AiProvider {
  readonly source = "openai" as const;
  readonly model = serverEnv.OPENAI_MODEL || "gpt-4.1-mini";
  private fail(): never {
    throw new Error("AI_PROVIDER_UNAVAILABLE");
  }
  analyzeProjectIntent(): never {
    return this.fail();
  }
  simplifyPatent(): never {
    return this.fail();
  }
  estimateBuild(): never {
    return this.fail();
  }
  suggestModernization(): never {
    return this.fail();
  }
  developPatent(): never {
    return this.fail();
  }
  summarizeClaims(): never {
    return this.fail();
  }
  translatePatentTexts(): never {
    return this.fail();
  }
}
const openAiRequested = serverEnv.AI_PROVIDER === "openai";
if (
  openAiRequested &&
  !serverEnv.OPENAI_API_KEY &&
  process.env.NODE_ENV === "development"
)
  console.warn(
    "[ORBIT] AI_PROVIDER=openai but OPENAI_API_KEY is missing; using mock AI in development.",
  );
export const aiProvider: AiProvider =
  providerModes.ai === "unavailable"
    ? new UnavailableAiProvider()
    : providerModes.ai === "openai" && serverEnv.OPENAI_API_KEY
      ? new OpenAiProvider()
      : openAiRequested && process.env.NODE_ENV === "production"
        ? new UnavailableAiProvider()
        : mock;
const ttl =
  process.env.NODE_ENV === "production" ? 24 * 60 * 60_000 : 2 * 60_000;
// Analyses of a published patent do not go stale; keep them shared for a month.
const durableTtl = 30 * 24 * 60 * 60_000;
const cache = new AsyncTtlCache();
let usedDevelopmentFallback = false;
/**
 * Memory first, then the shared durable cache, then the model. Only real model
 * output is persisted; development mock fallbacks stay in memory.
 */
function cachedAi<T>(
  key: string,
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  { shared = true }: { shared?: boolean } = {},
): Promise<T> {
  return cache.getOrCreate(key, ttl, async () => {
    if (!shared) return withDevelopmentFallback(primary, fallback);
    const stored = await durableGet<T>(key);
    if (stored !== undefined) return stored;
    return withDevelopmentFallback(async () => {
      const value = await primary();
      if (aiProvider.source === "openai") await durableSet(key, value, durableTtl);
      return value;
    }, fallback);
  });
}
async function withDevelopmentFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
) {
  try {
    return await primary();
  } catch (error) {
    if (
      allowsMockFallback(process.env.NODE_ENV) &&
      aiProvider.source === "openai"
    ) {
      usedDevelopmentFallback = true;
      if (process.env.NODE_ENV === "development")
        console.warn(
          "[ORBIT] OpenAI analysis failed; using development mock fallback.",
        );
      return fallback();
    }
    throw error;
  }
}
export function currentAiSource() {
  return usedDevelopmentFallback ? ("mock" as const) : aiProvider.source;
}
export function analyzeProjectIntent(
  text: string,
  locale: Locale,
): Promise<ProjectIntent> {
  const key = stableCacheKey("ai-intent", {
    provider: aiProvider.source,
    model: aiProvider.model,
    locale,
    text: text.trim().toLocaleLowerCase(),
  });
  // A user's project description stays out of the shared durable cache.
  return cachedAi(
    key,
    () => aiProvider.analyzeProjectIntent(text, locale),
    () => mock.analyzeProjectIntent(text, locale),
    { shared: false },
  );
}
export async function analyzePatent(
  p: Patent,
  locale: Locale,
): Promise<Analysis> {
  const base = stableCacheKey("ai-patent", {
    id: p.id,
    locale,
    provider: aiProvider.source,
    model: aiProvider.model,
  });
  const [simplification, build, modernization] = await Promise.all([
    cachedAi(
      `${base}:simplification`,
      () => aiProvider.simplifyPatent(p, locale),
      () => mock.simplifyPatent(p, locale),
    ),
    cachedAi(
      `${base}:build`,
      () => aiProvider.estimateBuild(p, locale),
      () => mock.estimateBuild(p, locale),
    ),
    cachedAi(
      `${base}:modernization`,
      () => aiProvider.suggestModernization(p, locale),
      () => mock.suggestModernization(p, locale),
    ),
  ]);
  return {
    simplification,
    build,
    modernization,
    source: currentAiSource(),
    asOf: new Date().toISOString().slice(0, 10),
    pricingVerified: false,
  };
}
/**
 * Direction-only ideas are shared through the caches. A user's own problem is
 * private: it is never cached, so it cannot surface in anyone else's results.
 */
export function developPatent(
  p: Patent,
  direction: DevelopmentDirection,
  problem: string | null,
  locale: Locale,
): Promise<DevelopmentHypothesis[]> {
  const primary = () => aiProvider.developPatent(p, direction, problem, locale);
  const fallback = () => mock.developPatent(p, direction, problem, locale);
  if (problem) return withDevelopmentFallback(primary, fallback);
  const key = stableCacheKey("ai-develop", {
    id: p.id,
    direction,
    locale,
    provider: aiProvider.source,
    model: aiProvider.model,
  });
  return cachedAi(key, primary, fallback);
}
export function summarizeClaims(
  p: Patent,
  claims: PatentClaim[],
  locale: Locale,
): Promise<ClaimScope> {
  const key = stableCacheKey("ai-claim-scope", {
    id: p.id,
    claims: claims.map((claim) => claim.number),
    locale,
    provider: aiProvider.source,
    model: aiProvider.model,
  });
  return cachedAi(
    key,
    () => aiProvider.summarizeClaims(p, claims, locale),
    () => mock.summarizeClaims(p, claims, locale),
  );
}
export function clearAiCacheForTests() {
  cache.clear();
  usedDevelopmentFallback = false;
}
