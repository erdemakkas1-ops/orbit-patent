import { EPO_CONFIG } from "./config";
type Token = { value: string; expiresAt: number };
export class EpoAuth {
  private token?: Token;
  private pending?: Promise<string>;
  constructor(
    private readonly key: string,
    private readonly secret: string,
  ) {}
  invalidate() {
    this.token = undefined;
  }
  async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now())
      return this.token.value;
    if (this.pending) return this.pending;
    this.pending = this.issue();
    try {
      return await this.pending;
    } finally {
      this.pending = undefined;
    }
  }
  private async issue() {
    const response = await fetch(EPO_CONFIG.tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.key}:${this.secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(EPO_CONFIG.timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("EPO_AUTH_UNAVAILABLE");
    if (!/json/i.test(response.headers.get("content-type") ?? ""))
      throw new Error("EPO_AUTH_INVALID");
    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== "object" ||
      typeof (body as { access_token?: unknown }).access_token !== "string"
    )
      throw new Error("EPO_AUTH_INVALID");
    const expires = Number((body as { expires_in?: unknown }).expires_in);
    if (!Number.isFinite(expires)) throw new Error("EPO_AUTH_INVALID");
    const token = (body as { access_token: string }).access_token;
    this.token = {
      value: token,
      expiresAt: Date.now() + Math.max(5, expires - 60) * 1000,
    };
    return token;
  }
}
