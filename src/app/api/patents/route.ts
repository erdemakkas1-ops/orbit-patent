import { NextResponse } from "next/server";
import { searchSchema } from "@/lib/patents/search-schema";
import { patentProvider } from "@/lib/patents";
import { apiError } from "@/lib/api";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const query = searchSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return NextResponse.json(await patentProvider.searchPatents(query));
  } catch (e) {
    return apiError(e);
  }
}
