import { parse, toSeconds } from "iso8601-duration";
import { NextResponse } from "next/server";
import { getEpisode } from "@/lib/nrk/nrk";

type Chapter = { title?: string; startTime?: number };

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ seriesId: string; episodeId: string }> }
) {
  const { seriesId, episodeId } = await params;
  const episode = await getEpisode(seriesId, episodeId);
  if (!episode) {
    return NextResponse.json(
      { message: `Episode ${episodeId} not found` },
      { status: 404 }
    );
  }
  const chapters: Chapter[] | null = episode.indexPoints
    ? episode.indexPoints.map((p) => ({
        title: p.title,
        startTime: p.startPoint ? toSeconds(parse(p.startPoint)) : undefined,
      }))
    : null;
  return NextResponse.json({
    version: "1.2.0",
    chapters: chapters ?? [],
  });
}
