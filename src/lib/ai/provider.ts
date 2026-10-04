import type { Patent, Locale, PatentClaim } from "@/types/patent";
import type {
  ProjectIntent,
  BuildEstimate,
  Simplification,
  ModernizationSuggestion,
  DevelopmentDirection,
  DevelopmentHypothesis,
  ClaimScope,
  PatentTranslation,
  PatentTranslationInput,
} from "@/types/ai";
export interface AiProvider {
  readonly source: "mock" | "openai";
  readonly model: string;
  analyzeProjectIntent(text: string, locale: Locale): Promise<ProjectIntent>;
  simplifyPatent(patent: Patent, locale: Locale): Promise<Simplification>;
  estimateBuild(patent: Patent, locale: Locale): Promise<BuildEstimate>;
  suggestModernization(
    patent: Patent,
    locale: Locale,
  ): Promise<ModernizationSuggestion[]>;
  developPatent(
    patent: Patent,
    direction: DevelopmentDirection,
    problem: string | null,
    locale: Locale,
  ): Promise<DevelopmentHypothesis[]>;
  summarizeClaims(
    patent: Patent,
    claims: PatentClaim[],
    locale: Locale,
  ): Promise<ClaimScope>;
  translatePatentTexts(
    patents: PatentTranslationInput[],
    locale: Locale,
  ): Promise<PatentTranslation[]>;
}
