import { NextRequest, NextResponse } from "next/server";
import { getSeries } from "@/lib/caching";
import { assembleFeed } from "@/lib/rss";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> }
) {
  const { seriesId } = await params;
  const series = await getSeries(seriesId);
  if (!series) {
    return NextResponse.json({ message: "Series not found" }, { status: 404 });
  }
  const feed = assembleFeed(series);
  return new NextResponse(feed, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=7200",
    },
  });
}
