import {
  fetchPlaybackUrlsBatch,
  getSeries as fetchSeries,
  getSeriesCatalogUpdates,
  parseSeries,
} from "./nrk/nrk"
import * as storage from "./storage-api"
import type { Series } from "./storage"

export type GetSeriesOptions = {
  onCacheMiss?: "fetch" | "trigger";
};

const SYNC_INTERVAL_HOURS = 1
const MAX_BYTES = 65_536

async function initialFetch(id: string): Promise<Series | null> {
  console.log("[feed] Miss, fetching from NRK:", id)
  const series = await fetchSeries(id)
  if (!series) {
    console.warn("[feed] NRK returned no data for:", id)
    return null
  }
  const ok = await storage.writeSeries(series)
  if (!ok) console.warn("[feed] Failed to persist after fetch:", id)
  return series
}

function trimSeriesToSize(series: Series, bytes: number): Series {
  const currentBytes = Buffer.byteLength(JSON.stringify(series))
  if (currentBytes <= bytes) return series
  return trimSeriesToSize(
    { ...series, episodes: series.episodes.slice(0, -1) },
    bytes,
  )
}

async function updateFetch(existing: Series): Promise<Series | null> {
  const knownEpisodeIds = new Set(existing.episodes.map((ep) => ep.id))
  const updatesCatalog = await getSeriesCatalogUpdates(existing.id, knownEpisodeIds)
  if (!updatesCatalog) return null

  const updateBatchSize = 20
  const resolvedEpisodes = []
  for (let i = 0; i < updatesCatalog.episodeResources.length; i += updateBatchSize) {
    const batch = updatesCatalog.episodeResources.slice(i, i + updateBatchSize)
    const playback = await fetchPlaybackUrlsBatch(batch, updatesCatalog.type)
    resolvedEpisodes.push(...playback)
  }
  const newEpisodes = parseSeries({
    series: updatesCatalog.series,
    episodes: resolvedEpisodes,
  }).episodes
  const updated = {
    ...existing,
    lastFetchedAt: new Date().toISOString(),
    episodes:
      newEpisodes.length > 0
        ? [...newEpisodes, ...existing.episodes].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          )
        : existing.episodes,
  }
  const trimmed = trimSeriesToSize(updated, MAX_BYTES)
  const ok = await storage.writeSeries(trimmed)
  if (!ok) console.warn("[feed] Failed to persist after update:", existing.id)
  return trimmed
}

function isStale(lastFetchedAt: string): boolean {
  const hours =
    (Date.now() - new Date(lastFetchedAt).getTime()) / (1000 * 60 * 60)
  return hours > SYNC_INTERVAL_HOURS
}

export async function getSeries(
  id: string,
  options?: GetSeriesOptions,
): Promise<Series | null> {
  const onMiss = options?.onCacheMiss ?? "fetch"
  const stored = await storage.readSeries(id)
  if (!stored) {
    if (onMiss === "trigger") return null
    return initialFetch(id)
  }
  if (!isStale(stored.lastFetchedAt)) {
    console.log("[feed] Hit:", id)
    return stored
  }
  console.log("[feed] Stale, re-fetching:", id)
  return updateFetch(stored)
}

