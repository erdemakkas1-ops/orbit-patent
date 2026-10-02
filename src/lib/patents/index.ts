import "server-only";
import { MockPatentProvider } from "./providers/mock";
import { EpoOpsClient, EpoOpsPatentProvider } from "./providers/epo";
import type { PatentProvider } from "./providers/provider";
import { providerModes, serverEnv } from "@/lib/env";
const key = serverEnv.EPO_OPS_CONSUMER_KEY,
  secret = serverEnv.EPO_OPS_CONSUMER_SECRET;
class UnavailableEpoProvider implements PatentProvider {
  readonly source = "epo" as const;
  private fail(): never {
    throw new Error("EPO_CREDENTIALS_UNAVAILABLE");
  }
  searchPatents(): never {
    return this.fail();
  }
  getPatentById(): never {
    return this.fail();
  }
  getPatentFamily(): never {
    return this.fail();
  }
  getLegalEvents(): never {
    return this.fail();
  }
}
const epoRequested = serverEnv.PATENT_PROVIDER === "epo";
if (epoRequested && (!key || !secret) && process.env.NODE_ENV === "development")
  console.warn(
    "[ORBIT] PATENT_PROVIDER=epo but EPO credentials are missing; using mock provider in development.",
  );
export const patentProvider: PatentProvider =
  providerModes.patent === "unavailable"
    ? new UnavailableEpoProvider()
    : providerModes.patent === "epo" && key && secret
      ? new EpoOpsPatentProvider(new EpoOpsClient(key, secret))
      : epoRequested && process.env.NODE_ENV === "production"
        ? new UnavailableEpoProvider()
        : new MockPatentProvider();
