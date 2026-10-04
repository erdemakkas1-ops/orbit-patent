import { NextResponse } from "next/server";
import { currentAiSource, developPatent } from "@/lib/ai";
import { patentProvider } from "@/lib/patents";
import {
  admitAiRequest,
  admitSharedAiRequest,
  apiError,
  developRequest,
  readLimitedJson,
} from "@/lib/api";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!admitAiRequest(request) || !(await admitSharedAiRequest(request)))
    return NextResponse.json(
      { error: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  try {
    const { id, direction, problem, locale } = developRequest.parse(
      await readLimitedJson(request),
    );
    const patent = await patentProvider.getPatentById(id);
    if (!patent)
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const hypotheses = await developPatent(patent, direction, problem, locale);
    return NextResponse.json(
      { hypotheses, source: currentAiSource() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
