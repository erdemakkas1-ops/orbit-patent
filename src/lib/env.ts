import "server-only";
import { resolveProviderModes, validateEnvironment } from "./env-schema";

export const serverEnv = validateEnvironment(process.env, process.env.NODE_ENV);
export const providerModes = resolveProviderModes(
  serverEnv,
  process.env.NODE_ENV,
);

if (!serverEnv.valid && process.env.NODE_ENV === "development") {
  console.warn(
    `[ORBIT] Environment configuration warning: ${serverEnv.issues.join(", ")}`,
  );
}
