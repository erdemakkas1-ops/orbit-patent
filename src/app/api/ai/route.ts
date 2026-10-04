import { NextResponse } from "next/server";
import { searchProject } from "@/lib/ai/search";
import {
  projectRequest,
  readLimitedJson,
  apiError,
  admitAiRequest,
  admitSharedAiRequest,
} from "@/lib/api";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!admitAiRequest(request) || !(await admitSharedAiRequest(request)))
    return NextResponse.json(
      { error: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  try {
    const { text, locale } = projectRequest.parse(
      await readLimitedJson(request),
    );
    return NextResponse.json(await searchProject(text, locale), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
