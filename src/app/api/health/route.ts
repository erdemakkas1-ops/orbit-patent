import { NextResponse } from "next/server";
import { providerModes } from "@/lib/env";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({
    status: "ok",
    patentProvider: providerModes.patent,
    patentReady: providerModes.patent !== "unavailable",
    aiProvider: providerModes.ai,
    aiReady: providerModes.ai !== "unavailable",
  });
}
