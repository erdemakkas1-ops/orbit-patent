import type { Patent, Locale } from "@/types/patent";
import type {
  ProjectIntent,
  BuildEstimate,
  Simplification,
  ModernizationSuggestion,
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
  translatePatentTexts(
    patents: PatentTranslationInput[],
    locale: Locale,
  ): Promise<PatentTranslation[]>;
}
