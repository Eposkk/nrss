import { inngest } from "./client";
import {
  fetchPlaybackUrlsBatch,
  getSeriesCatalog,
  type PlaybackResolvedEpisode,
  parseSeries,
} from "@/lib/nrk/nrk";
import * as storage from "@/lib/storage-api";

const NRK_FETCH_BATCH_SIZE = parseInt(
  process.env.NRK_FETCH_BATCH_SIZE ?? "10",
  10,
);
const NRK_FETCH_BATCH_DELAY_MS = parseInt(
  process.env.NRK_FETCH_BATCH_DELAY_MS ?? "10000",
  10,
);
const BATCH_SIZE =
  Number.isFinite(NRK_FETCH_BATCH_SIZE) && NRK_FETCH_BATCH_SIZE > 0
    ? NRK_FETCH_BATCH_SIZE
    : 10;
const STEP_SLEEP_DURATION =
  Number.isFinite(NRK_FETCH_BATCH_DELAY_MS) && NRK_FETCH_BATCH_DELAY_MS > 0
    ? `${NRK_FETCH_BATCH_DELAY_MS}ms`
    : null;

export const fetchSeries = inngest.createFunction(
  {
    id: "fetch-series",
    concurrency: { limit: 1 },
    rateLimit: {
      key: "event.data.seriesId",
      limit: 1,
      period: "60s",
    },
    retries: 2,
  },
  { event: "nrss/series.fetch" },
  async ({ event, step }) => {
    const { seriesId } = event.data;
    const catalog = await step.run("get-catalog", async () => {
      return await getSeriesCatalog(seriesId);
    });
    if (!catalog) {
      console.warn("[inngest] No data from NRK for:", seriesId);
      return { stored: false, reason: "no_data" };
    }

    const batchCount = Math.ceil(catalog.episodeResources.length / BATCH_SIZE);
    const episodes: PlaybackResolvedEpisode[] = [];
    for (let i = 0; i < batchCount; i++) {
      const start = i * BATCH_SIZE;
      const end = start + BATCH_SIZE;
      const playbackBatch = await step.run(`fetch-batch-${i}`, async () => {
        const result = await fetchPlaybackUrlsBatch(
          catalog.episodeResources.slice(start, end),
          catalog.type,
          { delayPerRequest: false },
        );
        console.log(
          "[inngest] Executed batch:",
          `${i + 1}/${batchCount}`,
          seriesId,
          `${result.length} playable`,
        );
        return result;
      });
      episodes.push(...playbackBatch);
      if (STEP_SLEEP_DURATION && i < batchCount - 1) {
        await step.sleep(`rate-limit-${i}`, STEP_SLEEP_DURATION);
      }
    }

    if (episodes.length === 0) {
      console.warn("[inngest] No playable episodes for:", seriesId);
      return { stored: false, reason: "no_playable_episodes" };
    }

    const series = parseSeries({ series: catalog.series, episodes });
    const ok = await step.run("persist-to-redis", async () => {
      return await storage.writeSeries(series);
    });
    if (!ok) console.warn("[inngest] Failed to persist:", seriesId);
    console.log("[inngest] Fetched and stored:", seriesId, series.episodes.length, "episodes");
    return { stored: true, episodes: series.episodes.length };
  },
);
