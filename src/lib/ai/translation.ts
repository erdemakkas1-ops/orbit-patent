import "server-only";
import type { Locale, Patent } from "@/types/patent";
import { aiProvider } from "./index";
import { localizePatentsWithProvider } from "./translation-core";

export function localizePatents(patents: Patent[], locale: Locale) {
  return localizePatentsWithProvider(patents, locale, aiProvider);
}
