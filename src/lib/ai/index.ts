import "server-only";
import { MockAiProvider } from "./mock";
import { OpenAiProvider } from "./openai";
import type { Locale, Patent } from "@/types/patent";
import type { AiProvider } from "./provider";
import type { Analysis, ProjectIntent } from "@/types/ai";
import { AsyncTtlCache, allowsMockFallback } from "./cache";
import { providerModes, serverEnv } from "@/lib/env";
import { stableCacheKey } from "@/lib/cache-key";
const mock = new MockAiProvider();
class UnavailableAiProvider implements AiProvider {
  readonly source = "openai" as const;
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
const cache = new AsyncTtlCache();
let usedDevelopmentFallback = false;
async function cached<T>(key: string, action: () => Promise<T>): Promise<T> {
  return cache.getOrCreate(key, ttl, action);
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
    locale,
    text: text.trim().toLocaleLowerCase(),
  });
  return cached(key, () =>
    withDevelopmentFallback(
      () => aiProvider.analyzeProjectIntent(text, locale),
      () => mock.analyzeProjectIntent(text, locale),
    ),
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
  });
  const [simplification, build, modernization] = await Promise.all([
    cached(`${base}:simplification`, () =>
      withDevelopmentFallback(
        () => aiProvider.simplifyPatent(p, locale),
        () => mock.simplifyPatent(p, locale),
      ),
    ),
    cached(`${base}:build`, () =>
      withDevelopmentFallback(
        () => aiProvider.estimateBuild(p, locale),
        () => mock.estimateBuild(p, locale),
      ),
    ),
    cached(`${base}:modernization`, () =>
      withDevelopmentFallback(
        () => aiProvider.suggestModernization(p, locale),
        () => mock.suggestModernization(p, locale),
      ),
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
export function clearAiCacheForTests() {
  cache.clear();
  usedDevelopmentFallback = false;
}
