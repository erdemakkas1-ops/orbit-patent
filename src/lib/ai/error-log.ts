type ErrorRecord = Record<string, unknown>;

export const isAiCreditExhausted = (error: unknown) => {
  const value =
    error && typeof error === "object" ? (error as ErrorRecord) : {};
  return value.code === "credit_balance_exhausted";
};

export class AiCreditCircuit {
  private blockedUntil = 0;
  private verified = false;
  private probe?: Promise<void>;
  constructor(private readonly cooldownMs = 5 * 60_000) {}
  assertAvailable(now = Date.now()) {
    if (this.blockedUntil > now) throw new Error("AI_CREDIT_EXHAUSTED");
  }
  observe(error: unknown, now = Date.now()) {
    if (isAiCreditExhausted(error)) {
      this.verified = false;
      this.blockedUntil = now + this.cooldownMs;
    }
  }
  async enter() {
    this.assertAvailable();
    if (this.verified) return () => {};
    if (this.probe) {
      await this.probe;
      this.assertAvailable();
      return () => {};
    }
    let release!: () => void;
    this.probe = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => {
      release();
      this.probe = undefined;
    };
  }
  observeSuccess() {
    this.verified = true;
    this.blockedUntil = 0;
  }
  clear() {
    this.verified = false;
    this.blockedUntil = 0;
  }
}

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
