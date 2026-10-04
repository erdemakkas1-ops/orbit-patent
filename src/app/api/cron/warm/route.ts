import { NextResponse } from "next/server";
import { warmDiscovery } from "@/lib/patents/warm";

export const runtime = "nodejs";
// Fluid compute allows up to 300 s; leave room to answer.
export const maxDuration = 300;

/** Daily cache warm-up, triggered by Vercel Cron (see vercel.json). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // Without the secret configured nobody may trigger it: it spends AI budget.
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const summary = await warmDiscovery(Date.now() + 270_000);
  return NextResponse.json(summary, {
    headers: { "Cache-Control": "no-store" },
  });
}
