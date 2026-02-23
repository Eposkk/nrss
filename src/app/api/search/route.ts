import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/nrk/nrk";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q?.trim()) {
    return NextResponse.json({ results: [] });
  }
  const results = await search(q.trim());
  return NextResponse.json({ results: results ?? [] });
}
