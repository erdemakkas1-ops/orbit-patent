import { NextResponse } from "next/server";
import { patentProvider } from "@/lib/patents";
import { apiError, patentId } from "@/lib/api";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = patentId.parse((await params).id);
    const patent = await patentProvider.getPatentById(id);
    return patent
      ? NextResponse.json(patent)
      : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  } catch (e) {
    return apiError(e);
  }
}
