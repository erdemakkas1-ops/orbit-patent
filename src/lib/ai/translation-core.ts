import { createHash } from "node:crypto";
import type { AiProvider } from "./provider";
import { AsyncTtlCache } from "./cache";
import { stableCacheKey } from "@/lib/cache-key";
import type { Locale, Patent, PatentTextTranslation } from "@/types/patent";

const ttl = 30 * 24 * 60 * 60_000;
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
  for (const [index, patent] of patents.entries()) {
    if (!needsTurkishTranslation(patent)) continue;
    const key = patentTranslationCacheKey(patent, locale, provider);
    const hit = translationCache.get<PatentTextTranslation>(key);
    if (hit) resolved.set(index, await hit);
    else misses.push({ index, key, source: sourceText(patent) });
  }

  if (misses.length) {
    try {
      const output = await provider.translatePatentTexts(
        misses.map(({ index, source }) => ({
          publicationNumber: patents[index].publicationNumber,
          ...source,
        })),
        locale,
      );
      for (const item of output) {
        const miss = misses[item.index];
        if (!miss) continue;
        const translation = {
          title: item.title.trim(),
          abstract: item.abstract.trim(),
          description: item.description.trim(),
        };
        if (!translation.title) continue;
        resolved.set(miss.index, translation);
        translationCache.set(miss.key, ttl, translation);
      }
    } catch {
      return patents;
    }
  }

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
