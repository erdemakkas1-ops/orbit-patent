import { z } from "zod";

const provider = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values).optional();
const secret = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

export const environmentSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(500).optional(),
  ),
  PATENT_PROVIDER: provider(["mock", "epo"]).default("mock"),
  EPO_OPS_CONSUMER_KEY: secret,
  EPO_OPS_CONSUMER_SECRET: secret,
  AI_PROVIDER: provider(["mock", "openai"]).default("mock"),
  OPENAI_API_KEY: secret,
  OPENAI_MODEL: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).max(100).optional(),
  ),
});

export type ServerEnvironment = z.infer<typeof environmentSchema> & {
  valid: boolean;
  issues: string[];
  patentReady: boolean;
  aiReady: boolean;
};

export function validateEnvironment(
  source: Record<string, string | undefined>,
  nodeEnv = source.NODE_ENV,
): ServerEnvironment {
  const parsed = environmentSchema.safeParse(source);
  const values = parsed.success
    ? parsed.data
    : environmentSchema.parse({
        PATENT_PROVIDER: "mock",
        AI_PROVIDER: "mock",
      });
  const issues = parsed.success
    ? []
    : [
        ...new Set(
          parsed.error.issues.map(
            (issue) => `INVALID_${String(issue.path[0] ?? "ENV")}`,
          ),
        ),
      ];
  if (
    nodeEnv === "production" &&
    values.PATENT_PROVIDER === "epo" &&
    (!values.EPO_OPS_CONSUMER_KEY || !values.EPO_OPS_CONSUMER_SECRET)
  )
    issues.push("EPO_CREDENTIALS_REQUIRED");
  if (
    nodeEnv === "production" &&
    values.AI_PROVIDER === "openai" &&
    !values.OPENAI_API_KEY
  )
    issues.push("OPENAI_API_KEY_REQUIRED");
  const patentReady = !issues.some((issue) =>
    [
      "INVALID_PATENT_PROVIDER",
      "INVALID_EPO_OPS_CONSUMER_KEY",
      "INVALID_EPO_OPS_CONSUMER_SECRET",
      "EPO_CREDENTIALS_REQUIRED",
    ].includes(issue),
  );
  const aiReady = !issues.some((issue) =>
    [
      "INVALID_AI_PROVIDER",
      "INVALID_OPENAI_API_KEY",
      "OPENAI_API_KEY_REQUIRED",
    ].includes(issue),
  );
  return {
    ...values,
    valid: issues.length === 0,
    issues,
    patentReady,
    aiReady,
  };
}

export function resolveProviderModes(
  environment: ServerEnvironment,
  nodeEnv: string | undefined,
) {
  const production = nodeEnv === "production";
  const patent =
    !environment.patentReady && production
      ? "unavailable"
      : environment.PATENT_PROVIDER === "epo"
        ? environment.EPO_OPS_CONSUMER_KEY &&
          environment.EPO_OPS_CONSUMER_SECRET
          ? "epo"
          : production
            ? "unavailable"
            : "mock"
        : "mock";
  const ai =
    !environment.aiReady && production
      ? "unavailable"
      : environment.AI_PROVIDER === "openai"
        ? environment.OPENAI_API_KEY
          ? "openai"
          : production
            ? "unavailable"
            : "mock"
        : "mock";
  return { patent, ai } as const;
}
