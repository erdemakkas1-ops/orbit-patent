type ErrorRecord = Record<string, unknown>;

const redact = (value: string) =>
  value
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED_API_KEY]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 300);

export function safeAiErrorDetails(
  error: unknown,
  operation: string,
  model: string,
  durationMs: number,
) {
  const value: ErrorRecord =
    error && typeof error === "object" ? (error as ErrorRecord) : {};
  return {
    operation,
    model,
    durationMs,
    status: typeof value.status === "number" ? value.status : 0,
    code:
      typeof value.code === "string"
        ? redact(value.code)
        : typeof value.type === "string"
          ? redact(value.type)
          : error instanceof Error
            ? error.name
            : "UNKNOWN_AI_ERROR",
    requestId:
      typeof value.request_id === "string"
        ? redact(value.request_id)
        : typeof value.requestId === "string"
          ? redact(value.requestId)
          : undefined,
    message: redact(
      error instanceof Error ? error.message : "AI request failed",
    ),
  };
}
