import { createHash } from "node:crypto";
import type { AiProvider } from "./provider";
import { AsyncTtlCache } from "./cache";
import { stableCacheKey } from "@/lib/cache-key";
import { durableGet, durableSet } from "@/lib/durable-cache";
import type { Locale, Patent, PatentTextTranslation } from "@/types/patent";

const ttl = 30 * 24 * 60 * 60_000;
const TRANSLATION_BATCH_SIZE = 3;
const translationCache = new AsyncTtlCache(1000);
type TranslationProvider = Pick<
  AiProvider,
  "source" | "model" | "translatePatentTexts"
>;

const sourceText = (patent: Patent): PatentTextTranslation => ({
  title: patent.title.en || patent.title.tr || patent.publicationNumber,
  abstract: patent.abstract.en || patent.abstract.tr,
  description:
    patent.description.en ||
    patent.description.tr ||
    patent.abstract.en ||
    patent.abstract.tr,
});

export function patentTranslationCacheKey(
  patent: Patent,
  locale: Locale,
  provider: Pick<AiProvider, "source" | "model">,
) {
  const source = sourceText(patent);
  const sourceHash = createHash("sha256")
    .update(JSON.stringify(source))
    .digest("hex");
  return stableCacheKey("patent-translation", {
    publicationNumber: patent.publicationNumber,
    sourceHash,
    target: locale,
    provider: provider.source,
    model: provider.model,
  });
}

function needsTurkishTranslation(patent: Patent) {
  return !(
    patent.title.tr.trim() &&
    patent.abstract.tr.trim() &&
    patent.description.tr.trim()
  );
}

export async function localizePatentsWithProvider(
  patents: Patent[],
  locale: Locale,
  provider: TranslationProvider,
): Promise<Patent[]> {
  if (locale !== "tr" || provider.source !== "openai" || !patents.length)
    return patents;

  const resolved = new Map<number, PatentTextTranslation>();
  const misses: {
    index: number;
    key: string;
    source: PatentTextTranslation;
  }[] = [];
  const lookups = await Promise.all(
    [...patents.entries()]
      .filter(([, patent]) => needsTurkishTranslation(patent))
      .map(async ([index, patent]) => {
        const key = patentTranslationCacheKey(patent, locale, provider);
        const hit =
          (await translationCache.get<PatentTextTranslation>(key)) ??
          (await durableGet<PatentTextTranslation>(key));
        return { index, key, patent, hit };
      }),
  );
  for (const { index, key, patent, hit } of lookups) {
    if (hit) {
      resolved.set(index, hit);
      translationCache.set(key, ttl, hit);
    } else misses.push({ index, key, source: sourceText(patent) });
  }

  // Small parallel batches: one long batch can exceed the model timeout and
  // would drop every translation on the page at once.
  const chunks: (typeof misses)[] = [];
  for (let i = 0; i < misses.length; i += TRANSLATION_BATCH_SIZE)
    chunks.push(misses.slice(i, i + TRANSLATION_BATCH_SIZE));
  await Promise.allSettled(
    chunks.map(async (chunk) => {
      const output = await provider.translatePatentTexts(
        chunk.map(({ index, source }) => ({
          publicationNumber: patents[index].publicationNumber,
          ...source,
        })),
        locale,
      );
      for (const item of output) {
        const miss = chunk[item.index];
        if (!miss) continue;
        const translation = {
          title: item.title.trim(),
          abstract: item.abstract.trim(),
          description: item.description.trim(),
        };
        if (!translation.title) continue;
        resolved.set(miss.index, translation);
        translationCache.set(miss.key, ttl, translation);
        void durableSet(miss.key, translation, ttl);
      }
    }),
  );

  return patents.map((patent, index) => {
    const translation = resolved.get(index);
    return translation
      ? {
          ...patent,
          translations: { ...patent.translations, tr: translation },
        }
      : patent;
  });
}

export function clearTranslationCacheForTests() {
  translationCache.clear();
}
