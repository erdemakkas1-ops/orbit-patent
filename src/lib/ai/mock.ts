import type { AiProvider } from "./provider";
import type { Locale, Patent } from "@/types/patent";
import type { BuildEstimate } from "@/types/ai";
import { topics, aiCopy } from "@/data/mock-ai";
import { fold } from "@/lib/patents/search-schema";
import { mockBuild } from "@/data/mock-builds";
export class MockAiProvider implements AiProvider {
  readonly source = "mock" as const;
  readonly model = "mock-v1";
  async analyzeProjectIntent(text: string, _locale: Locale) {
    const normalized = fold(text);
    const matches = topics.filter((t) =>
      t.terms.some((term) => normalized.includes(term)),
    );
    const keywords = [...new Set(matches.flatMap((t) => t.keywords))].slice(
      0,
      12,
    );
    if (!keywords.length)
      keywords.push(
        ...text
          .split(/\s+/)
          .filter(
            (t) =>
              t.length > 3 &&
              ![
                "yapmak",
                "istiyorum",
                "olan",
                "yapan",
                "cihaz",
                "want",
                "build",
                "with",
                "that",
                "have",
                "make",
                "using",
              ].includes(fold(t)),
          )
          .slice(0, 8),
      );
    return {
      summary:
        _locale === "tr"
          ? `Proje; ${keywords.join(", ")} bileşenlerini bir araya getiren uygulanabilir bir prototip fikridir.`
          : `The project is a prototype concept combining ${keywords.join(", ")}.`,
      keywords,
      concepts: matches.length
        ? [...new Set(matches.flatMap((t) => t.concepts))].slice(0, 8)
        : keywords.slice(0, 5),
      suggestedCpc: [...new Set(matches.flatMap((t) => t.cpc))].slice(0, 6),
      suggestedIpc: [...new Set(matches.flatMap((t) => t.ipc))].slice(0, 6),
      searchQueries: keywords.slice(0, 5),
      technicalDomains: matches.length
        ? [...new Set(matches.flatMap((t) => t.domains))].slice(0, 8)
        : ["General Engineering"],
    };
  }
  async simplifyPatent(p: Patent, l: Locale) {
    return {
      functionSummary: p.abstract[l],
      whyInterestingToday: aiCopy[l].interesting,
      keyTechnicalIdea: p.title[l],
      limitations: [
        l === "tr"
          ? "Patent özeti üretim toleransları ve sertifikasyon gereksinimlerini ayrıntılandırmayabilir."
          : "The abstract may not detail manufacturing tolerances or certification requirements.",
      ],
    };
  }
  async estimateBuild(p: Patent, l: Locale): Promise<BuildEstimate> {
    return mockBuild(p.id, l);
  }
  async suggestModernization(_p: Patent, l: Locale) {
    return aiCopy[l].modern.map((description, index) => ({
      title:
        l === "tr"
          ? ["Yerel veri işleme", "Modüler donanım", "Doğrulanabilir güvenlik"][
              index
            ]
          : ["Local data processing", "Modular hardware", "Verifiable safety"][
              index
            ],
      description,
      benefit:
        l === "tr"
          ? "Daha ölçülebilir ve bakımı kolay bir prototip sağlar."
          : "Creates a more measurable and maintainable prototype.",
      difficultyImpact: index === 2 ? 1 : 0.5,
      estimatedCostImpact: [450, 700, 350][index],
    }));
  }
  async translatePatentTexts(): Promise<never> {
    throw new Error("AI_TRANSLATION_UNAVAILABLE");
  }
}
