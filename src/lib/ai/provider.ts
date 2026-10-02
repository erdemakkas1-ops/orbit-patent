import type { Patent, Locale } from "@/types/patent";
import type {
  ProjectIntent,
  BuildEstimate,
  Simplification,
  ModernizationSuggestion,
} from "@/types/ai";
export interface AiProvider {
  readonly source: "mock" | "openai";
  analyzeProjectIntent(text: string, locale: Locale): Promise<ProjectIntent>;
  simplifyPatent(patent: Patent, locale: Locale): Promise<Simplification>;
  estimateBuild(patent: Patent, locale: Locale): Promise<BuildEstimate>;
  suggestModernization(
    patent: Patent,
    locale: Locale,
  ): Promise<ModernizationSuggestion[]>;
}
