import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({
    status: "ok",
    patentProvider: serverEnv.PATENT_PROVIDER,
    aiProvider: serverEnv.AI_PROVIDER,
  });
}
