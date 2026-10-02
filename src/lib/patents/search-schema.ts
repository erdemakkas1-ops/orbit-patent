import { z } from "zod";
import { LegalStatus } from "@/types/patent";
const optionalString = z.string().trim().max(160).optional();
export const searchSchema = z.object({
  q: optionalString,
  cpc: optionalString,
  ipc: optionalString,
  year: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().int().min(1800).max(2100).optional(),
  ),
  status: z.preprocess(
    (v) => (typeof v === "string" && v ? v.toUpperCase() : undefined),
    z.enum(LegalStatus).optional(),
  ),
  sort: z.enum(["newest", "oldest", "relevance"]).default("newest"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export function fold(text: string) {
  return text
    .toLocaleLowerCase("tr")
    .replaceAll("ı", "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
