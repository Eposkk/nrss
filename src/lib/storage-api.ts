import { Redis } from "@upstash/redis";
import { createClient } from "redis";
import type { Series } from "./storage";

const KEY_PREFIX = "series:";

type KvClient = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
};

function useUpstash(): KvClient | null {
  const has =
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
    (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN);
  if (!has) return null;
  const redis = Redis.fromEnv();
  return {
    get: async (k) => (await redis.get(k)) as string | null,
    set: (k, v) => redis.set(k, v),
  };
}

let localClient: ReturnType<typeof createClient> | null = null;

async function useLocalRedis(): Promise<KvClient | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!localClient) {
    localClient = createClient({ url });
    await localClient.connect();
  }
  return {
    get: (k) => localClient!.get(k),
    set: (k, v) => localClient!.set(k, v),
  };
}

export async function disconnect(): Promise<void> {
  if (localClient) {
    await localClient.quit();
    localClient = null;
    kv = null;
  }
}

let kv: KvClient | null = null;

async function getKv(): Promise<KvClient | null> {
  if (kv) return kv;
  kv = (await useLocalRedis()) ?? useUpstash();
  return kv;
}

export async function readSeries(id: string): Promise<Series | null> {
  const client = await getKv();
  if (!client) return null;
  const raw = await client.get(`${KEY_PREFIX}${id}`);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as Series;
  } catch {
    return null;
  }
}

export async function writeSeries(series: Series): Promise<boolean> {
  const client = await getKv();
  if (!client) {
    console.warn("[storage] No Redis client; series not persisted:", series.id);
    return false;
  }
  try {
    await client.set(`${KEY_PREFIX}${series.id}`, JSON.stringify(series));
    console.log("[storage] Wrote series:", series.id, `(${series.episodes.length} episodes)`);
    return true;
  } catch (err) {
    console.error("[storage] writeSeries failed:", series.id, err);
    return false;
  }
}
