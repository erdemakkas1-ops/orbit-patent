import { z } from "zod";
const short = z.string().trim().min(1).max(500);
export const intentSchema = z.object({
  summary: short,
  keywords: z.array(short).max(12),
  concepts: z.array(short).max(10),
  suggestedCpc: z.array(short).max(6),
  suggestedIpc: z.array(short).max(6),
  searchQueries: z.array(short).max(5),
  technicalDomains: z.array(short).max(8),
});
export const simplificationSchema = z.object({
  functionSummary: short,
  whyInterestingToday: short,
  keyTechnicalIdea: short,
  limitations: z.array(short).max(8),
});
const score = z.number().min(0).max(10);
export const difficultyInputSchema = z.object({
  breakdown: z.object({
    electronics: score,
    software: score,
    mechanical: score,
    manufacturing: score,
    testing: score,
  }),
  reasons: z
    .array(
      z.object({
        area: z.enum([
          "electronics",
          "software",
          "mechanical",
          "manufacturing",
          "testing",
        ]),
        reason: short,
      }),
    )
    .max(10),
});
export const materialSchema = z.object({
  name: short,
  quantity: z.number().min(1).max(1000),
  estimatedUnitCost: z.number().nonnegative().max(10_000_000),
  category: z.enum([
    "electronics",
    "mechanical",
    "sensors",
    "pcb",
    "power",
    "software",
    "other",
  ]),
  reason: short,
  replacementFor: z.string().trim().max(300).nullable(),
});
export const costInputSchema = z.object({
  items: z.array(materialSchema).min(1).max(30),
  assumptions: z.array(short).max(10),
});
export const modernizationSchema = z.object({
  suggestions: z
    .array(
      z.object({
        title: short,
        description: short,
        benefit: short,
        difficultyImpact: z.number().min(-3).max(3),
        estimatedCostImpact: z.number().min(-1_000_000).max(1_000_000),
      }),
    )
    .max(8),
});
export const patentTranslationBatchSchema = z.object({
  items: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        title: short,
        abstract: z.string().trim().max(4000),
        description: z.string().trim().max(12000),
      }),
    )
    .max(20),
});
export type PatentTranslationInput = {
  publicationNumber: string;
  title: string;
  abstract: string;
  description: string;
};
export type PatentTranslation = z.infer<
  typeof patentTranslationBatchSchema
>["items"][number];
export type ProjectIntent = z.infer<typeof intentSchema>;
export type Simplification = z.infer<typeof simplificationSchema>;
export type DifficultyInput = z.infer<typeof difficultyInputSchema>;
export type Material = z.infer<typeof materialSchema>;
export type ModernizationSuggestion = z.infer<
  typeof modernizationSchema
>["suggestions"][number];
export interface DifficultyAnalysis extends DifficultyInput {
  overall: number;
}
export interface CostItem extends Material {
  subtotal: number;
}
export interface CostEstimate {
  min: number;
  max: number;
  currency: "TRY";
  items: CostItem[];
  assumptions: string[];
  warning: string;
}
export interface BuildEstimate {
  difficulty: DifficultyAnalysis;
  cost: CostEstimate;
  materials: Material[];
}
export interface Analysis {
  simplification: Simplification;
  build: BuildEstimate;
  modernization: ModernizationSuggestion[];
  source: "mock" | "openai";
  asOf: string;
  pricingVerified: false;
}
