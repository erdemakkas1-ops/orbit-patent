import "server-only";
import { z } from "zod";
import { NextResponse } from "next/server";
import { publicErrorCode } from "./errors";
import { normalizeProjectText } from "./ai/input";
import { developmentDirections } from "@/types/ai";
export { admitAiRequest, admitSharedAiRequest } from "./rate-limit";
export const projectRequest = z.object({
  text: z.string().trim().min(10).max(3000).transform(normalizeProjectText),
  locale: z.enum(["tr", "en"]).default("tr"),
});
export const patentId = z.string().trim().min(1).max(100);
export const developRequest = z.object({
  id: patentId,
  direction: z.enum(developmentDirections),
  // Optional; blank means "direction only", which can be shared via cache.
  problem: z
    .string()
    .max(600)
    .optional()
    .transform((value) => {
      const text = value ? normalizeProjectText(value).trim() : "";
      return text ? text.slice(0, 500) : null;
    }),
  locale: z.enum(["tr", "en"]).default("tr"),
});
export function apiError(error: unknown) {
  const code = publicErrorCode(error);
  return NextResponse.json(
    { error: code },
    { status: code === "INVALID_INPUT" ? 400 : 503 },
  );
}
export async function readLimitedJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) {
      await reader.cancel();
      throw new SyntaxError();
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
