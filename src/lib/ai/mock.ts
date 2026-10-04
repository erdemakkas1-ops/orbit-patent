import type { AiProvider } from "./provider";
import type { Locale, Patent, PatentClaim } from "@/types/patent";
import type {
  BuildEstimate,
  DevelopmentDirection,
  DevelopmentHypothesis,
} from "@/types/ai";
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
  async developPatent(
    p: Patent,
    direction: DevelopmentDirection,
    problem: string | null,
    l: Locale,
  ): Promise<DevelopmentHypothesis[]> {
    const title = p.title[l] || p.title.en;
    const tr = l === "tr";
    const angle = {
      cheaper: tr
        ? ["Parça sayısını azalt", "parça sayısını ve montaj adımlarını azaltan"]
        : ["Cut the part count", "that reduces parts and assembly steps"],
      smarter: tr
        ? ["Sensörle geri bildirim ekle", "durumu ölçüp kendini ayarlayan"]
        : ["Add sensor feedback", "that measures its state and adjusts itself"],
      "new-use": tr
        ? ["Yeni bir kullanıcıya taşı", "farklı bir kullanıcı grubuna uyarlanan"]
        : ["Move it to a new user", "adapted to a different group of users"],
    }[direction];
    return [
      {
        title: angle[0],
        idea: tr
          ? `${title} fikrini ${angle[1]} bir prototipe dönüştür${problem ? `; hedef: ${problem}` : ""}.`
          : `Turn ${title} into a prototype ${angle[1]}${problem ? `; goal: ${problem}` : ""}.`,
        basis: tr
          ? "Patent özeti mekanizmanın temel parçalarını tanımlıyor (örnek veri)."
          : "The abstract describes the core parts of the mechanism (sample data).",
        uncertainty: tr
          ? "Gerçek yükler ve malzeme toleransları kaynakta yok."
          : "Real loads and material tolerances are not in the source.",
        test: tr
          ? "İki prototip yap, aynı görevde ölç; yeni sürüm hedef ölçütte daha iyi değilse hipotez yanlıştır."
          : "Build two prototypes and measure them on the same task; if the new one is not better on the target metric, the hypothesis is wrong.",
      },
    ];
  }
  async summarizeClaims(_p: Patent, claims: PatentClaim[], l: Locale) {
    const first = claims[0];
    return {
      summary:
        l === "tr"
          ? `İstem ${first?.number ?? 1} şu yapıyı korumak istiyor (örnek veri): ${first?.text.slice(0, 160) ?? ""}`
          : `Claim ${first?.number ?? 1} seeks to protect (sample data): ${first?.text.slice(0, 160) ?? ""}`,
      claimNumbers: claims.slice(0, 3).map((claim) => claim.number),
    };
  }
  async translatePatentTexts(): Promise<never> {
    throw new Error("AI_TRANSLATION_UNAVAILABLE");
  }
}
