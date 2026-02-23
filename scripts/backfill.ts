import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { getSeries, listAllPodcastIds } from "../src/lib/nrk/nrk";
import * as storage from "../src/lib/storage-api";

const DELAY_MS = parseInt(process.env.BACKFILL_DELAY_MS ?? "10000", 10);
const DELAY_JITTER = Math.min(1, Math.max(0, parseFloat(process.env.BACKFILL_DELAY_JITTER ?? "0.5")));
const SKIP_EXISTING = process.env.BACKFILL_SKIP_EXISTING !== "false";
const PRIORITY_ONLY = process.env.BACKFILL_PRIORITY_ONLY === "1";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function delayWithJitter(baseMs: number): number {
  if (baseMs <= 0) return 0;
  const spread = baseMs * DELAY_JITTER;
  return Math.round(baseMs + (Math.random() * 2 - 1) * spread);
}

function loadPrioritySeries(): string[] {
  try {
    const path = join(__dirname, "../data/priority-series.json");
    const json = readFileSync(path, "utf-8");
    const ids = JSON.parse(json) as string[];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

async function main() {
  const hasRedis =
    process.env.REDIS_URL ||
    ((process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
      (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN));
  if (!hasRedis) {
    console.error(
      "Redis not configured. Set REDIS_URL (local) or UPSTASH_REDIS_REST_* (production)."
    );
    process.exit(1);
  }

  const priorityIds = loadPrioritySeries();
  const singleId = process.env.BACKFILL_SERIES_ID ?? process.argv[2];
  let podcasts = singleId
    ? [{ seriesId: singleId, title: singleId }]
    : await listAllPodcastIds();

  if (!singleId && priorityIds.length > 0) {
    const prioritySet = new Set(priorityIds);
    const catalogMap = new Map(podcasts.map((p) => [p.seriesId, p]));
    const priority = priorityIds.map((id) => catalogMap.get(id) ?? { seriesId: id, title: id });
    const rest = podcasts.filter((p) => !prioritySet.has(p.seriesId));
    podcasts = PRIORITY_ONLY ? priority : [...priority, ...rest];
    if (PRIORITY_ONLY && podcasts.length > 0) {
      console.log(`Priority-only mode: ${podcasts.length} series`);
    }
  }
  console.log(
    singleId ? `Backfilling single podcast: ${singleId}` : `Found ${podcasts.length} podcasts`
  );
  const nrkDelay = process.env.NRK_FETCH_DELAY_MS ?? "0";
  console.log(`Delay: ${DELAY_MS}ms between series, NRK_FETCH_DELAY_MS: ${nrkDelay}ms, skip existing: ${SKIP_EXISTING}`);

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const { seriesId, title } of podcasts) {
    try {
      if (SKIP_EXISTING) {
        const existing = await storage.readSeries(seriesId);
        if (existing) {
          skipped++;
          continue;
        }
      }

      const series = await getSeries(seriesId);
      if (series) {
        await storage.writeSeries(series);
        done++;
        console.log(`[${done}/${podcasts.length}] ${title} (${series.episodes.length} episodes)`);
      } else {
        failed++;
        console.error(`No data for ${seriesId} (${title})`);
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed ${seriesId} (${title}): ${msg}`);
    }
    await sleep(delayWithJitter(DELAY_MS));
  }

  console.log(`Done. Fetched: ${done}, skipped: ${skipped}, failed: ${failed}`);
  await storage.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
