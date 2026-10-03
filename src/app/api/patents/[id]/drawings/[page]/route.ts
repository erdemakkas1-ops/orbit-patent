import { NextResponse } from "next/server";
import { z } from "zod";
import { patentProvider } from "@/lib/patents";
import { patentId } from "@/lib/api";

export const runtime = "nodejs";

const drawingPage = z.coerce.number().int().min(1).max(5);
const drawingVariant = z.enum(["full", "card"]).default("full");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; page: string }> },
) {
  try {
    const values = await params;
    const id = patentId.parse(values.id);
    const page = drawingPage.parse(values.page);
    const variant = drawingVariant.parse(
      new URL(request.url).searchParams.get("variant") ?? undefined,
    );
    if (!patentProvider.getPatentDrawingPage)
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const drawing = await patentProvider.getPatentDrawingPage(
      id,
      page,
      variant,
    );
    if (drawing.contentType !== "image/png")
      throw new Error("EPO_DRAWING_INVALID_CONTENT");
    return new NextResponse(Buffer.from(drawing.body), {
      headers: {
        "Content-Type": drawing.contentType,
        "Cache-Control":
          "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status =
      error instanceof z.ZodError || code === "EPO_INVALID_DRAWING_PAGE"
        ? 400
        : code === "EPO_DRAWING_NOT_FOUND"
          ? 404
          : 503;
    return NextResponse.json(
      {
        error:
          status === 400
            ? "INVALID_INPUT"
            : status === 404
              ? "NOT_FOUND"
              : "SERVICE_UNAVAILABLE",
      },
      { status },
    );
  }
}
