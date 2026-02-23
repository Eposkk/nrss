import { getSeries as fetchSeries } from "./nrk/nrk";
import * as storage from "./storage-api";
import type { Series } from "./storage";

const SYNC_INTERVAL_HOURS = 1;
const MAX_BYTES = 65_536;

async function initialFetch(id: string): Promise<Series | null> {
  const series = await fetchSeries(id);
  if (!series) return null;
  await storage.writeSeries(series);
  return series;
}

function trimSeriesToSize(series: Series, bytes: number): Series {
  const currentBytes = Buffer.byteLength(JSON.stringify(series));
  if (currentBytes <= bytes) return series;
  return trimSeriesToSize(
    { ...series, episodes: series.episodes.slice(0, -1) },
    bytes
  );
}

async function updateFetch(existing: Series): Promise<Series | null> {
  const fresh = await fetchSeries(existing.id);
  if (!fresh) return null;

  const newEpisodes = fresh.episodes.filter(
    (ep) => !existing.episodes.some((e) => e.id === ep.id)
  );
  if (newEpisodes.length === 0) return existing;

  const merged = {
    ...existing,
    lastFetchedAt: new Date().toISOString(),
    episodes: [...newEpisodes, ...existing.episodes].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    ),
  };

  const trimmed = trimSeriesToSize(merged, MAX_BYTES);
  await storage.writeSeries(trimmed);
  return trimmed;
}

function isStale(lastFetchedAt: string): boolean {
  const hours =
    (Date.now() - new Date(lastFetchedAt).getTime()) / (1000 * 60 * 60);
  return hours > SYNC_INTERVAL_HOURS;
}

export async function getSeries(id: string): Promise<Series | null> {
  const stored = await storage.readSeries(id);
  if (!stored) return initialFetch(id);
  if (!isStale(stored.lastFetchedAt)) return stored;
  return updateFetch(stored);
}
