import { z } from "zod";

export type PublicErrorCode =
  "INVALID_INPUT" | "NOT_FOUND" | "RATE_LIMITED" | "SERVICE_UNAVAILABLE";

export function publicErrorCode(error: unknown): PublicErrorCode {
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return "INVALID_INPUT";
  return "SERVICE_UNAVAILABLE";
}
