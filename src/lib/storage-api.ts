import { Redis } from '@upstash/redis'
import { createClient } from 'redis'
import type { Series } from './storage'
import { ENV, REDIS_KEYS } from './constants'

const KEY_PREFIX = REDIS_KEYS.SERIES_PREFIX
const LOCK_PREFIX = REDIS_KEYS.SERIES_LOCK_PREFIX
const PROGRESS_PREFIX = REDIS_KEYS.SERIES_PROGRESS_PREFIX
const QUEUE_LIST_KEY = REDIS_KEYS.SERIES_QUEUE_LIST
const QUEUE_SET_KEY = REDIS_KEYS.SERIES_QUEUE_SET
const QUEUE_ACTIVE_KEY = REDIS_KEYS.SERIES_QUEUE_ACTIVE

export type SeriesFetchProgress = {
	status: 'queued' | 'running' | 'failed'
	queuePosition?: number
	totalBatches: number
	completedBatches: number
	totalEpisodes: number
	completedEpisodes: number
	message?: string
	updatedAt: string
}

type KvClient = {
	get: (key: string) => Promise<string | null>
	set: (key: string, value: string) => Promise<unknown>
	setEx: (key: string, value: string, ttlSeconds: number) => Promise<unknown>
	del: (key: string) => Promise<number>
	rpush: (key: string, value: string) => Promise<number>
	lpop: (key: string) => Promise<string | null>
	lrange: (key: string, start: number, stop: number) => Promise<string[]>
	sadd: (key: string, value: string) => Promise<number>
	srem: (key: string, value: string) => Promise<number>
	sismember: (key: string, value: string) => Promise<boolean>
	setNxEx: (key: string, value: string, ttlSeconds: number) => Promise<boolean>
}

function getUpstash(): KvClient | null {
	const has =
		(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
		(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
	if (!has) return null
	const redis = Redis.fromEnv()
	return {
		get: async (k) => (await redis.get(k)) as string | null,
		set: (k, v) => redis.set(k, v),
		setEx: (k, v, ttlSeconds) => redis.set(k, v, { ex: ttlSeconds }),
		del: (k) => redis.del(k),
		rpush: (k, v) => redis.rpush(k, v),
		lpop: async (k) => (await redis.lpop(k)) as string | null,
		lrange: async (k, start, stop) =>
			((await redis.lrange(k, start, stop)) as string[]) ?? [],
		sadd: async (k, v) => (await redis.sadd(k, v)) as number,
		srem: async (k, v) => (await redis.srem(k, v)) as number,
		sismember: async (k, v) => {
			const res = await redis.sismember(k, v)
			return Number(res) === 1
		},
		setNxEx: async (k, v, ttlSeconds) => {
			const res = await redis.set(k, v, { nx: true, ex: ttlSeconds })
			return res === 'OK'
		},
	}
}

let localClient: ReturnType<typeof createClient> | null = null

async function getLocalRedis(): Promise<KvClient | null> {
	const url = process.env.REDIS_URL
	if (!url) return null
	if (!localClient) {
		localClient = createClient({ url })
		await localClient.connect()
	}
	return {
		get: (k) => localClient!.get(k),
		set: (k, v) => localClient!.set(k, v),
		setEx: (k, v, ttlSeconds) => localClient!.set(k, v, { EX: ttlSeconds }),
		del: (k) => localClient!.del(k),
		rpush: (k, v) => localClient!.rPush(k, v),
		lpop: async (k) => await localClient!.lPop(k),
		lrange: (k, start, stop) => localClient!.lRange(k, start, stop),
		sadd: (k, v) => localClient!.sAdd(k, v),
		srem: (k, v) => localClient!.sRem(k, v),
		sismember: async (k, v) => {
			const res = await localClient!.sIsMember(k, v)
			return Number(res) === 1
		},
		setNxEx: async (k, v, ttlSeconds) => {
			const res = await localClient!.set(k, v, { NX: true, EX: ttlSeconds })
			return res === 'OK'
		},
	}
}

export async function disconnect(): Promise<void> {
	if (localClient) {
		await localClient.quit()
		localClient = null
		kv = null
	}
}

let kv: KvClient | null = null

async function getKv(): Promise<KvClient | null> {
	if (kv) return kv
	kv = (await getLocalRedis()) ?? getUpstash()
	return kv
}

function createLockToken(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function readSeries(id: string): Promise<Series | null> {
	const client = await getKv()
	if (!client) return null
	const raw = await client.get(`${KEY_PREFIX}${id}`)
	if (raw == null) return null
	try {
		return JSON.parse(raw) as Series
	} catch {
		return null
	}
}

export async function writeSeries(series: Series): Promise<boolean> {
	const client = await getKv()
	if (!client) {
		console.warn('[storage] No Redis client; series not persisted:', series.id)
		return false
	}
	try {
		await client.set(`${KEY_PREFIX}${series.id}`, JSON.stringify(series))
		console.log(
			'[storage] Wrote series:',
			series.id,
			`(${series.episodes.length} episodes)`
		)
		return true
	} catch (err) {
		console.error('[storage] writeSeries failed:', series.id, err)
		return false
	}
}

export async function acquireSeriesLock(
	seriesId: string,
	ttlSeconds: number
): Promise<string | null> {
	const client = await getKv()
	if (!client) return null
	const key = `${LOCK_PREFIX}${seriesId}`
	const token = createLockToken()
	const acquired = await client.setNxEx(key, token, ttlSeconds)
	return acquired ? token : null
}

export async function releaseSeriesLock(
	seriesId: string,
	token: string
): Promise<void> {
	const client = await getKv()
	if (!client) return
	const key = `${LOCK_PREFIX}${seriesId}`
	const currentToken = await client.get(key)
	if (currentToken !== token) return
	await client.del(key)
}

export async function readSeriesFetchProgress(
	seriesId: string
): Promise<SeriesFetchProgress | null> {
	const client = await getKv()
	if (!client) return null
	const raw = await client.get(`${PROGRESS_PREFIX}${seriesId}`)
	if (raw == null) return null
	try {
		return JSON.parse(raw) as SeriesFetchProgress
	} catch {
		return null
	}
}

export async function writeSeriesFetchProgress(
	seriesId: string,
	progress: SeriesFetchProgress
): Promise<void> {
	const client = await getKv()
	if (!client) return
	await client.setEx(
		`${PROGRESS_PREFIX}${seriesId}`,
		JSON.stringify(progress),
		ENV.SERIES_PROGRESS_TTL_SEC
	)
}

export async function clearSeriesFetchProgress(
	seriesId: string
): Promise<void> {
	const client = await getKv()
	if (!client) return
	await client.del(`${PROGRESS_PREFIX}${seriesId}`)
}

export async function getQueuePosition(
	seriesId: string
): Promise<number | null> {
	const client = await getKv()
	if (!client) return null
	const active = await client.get(QUEUE_ACTIVE_KEY)
	if (active === seriesId) return 0
	const items = await client.lrange(QUEUE_LIST_KEY, 0, -1)
	const idx = items.findIndex((item) => item === seriesId)
	return idx === -1 ? null : idx + 1
}

export async function isSeriesQueuedOrActive(
	seriesId: string
): Promise<boolean> {
	const client = await getKv()
	if (!client) return false
	const active = await client.get(QUEUE_ACTIVE_KEY)
	if (active === seriesId) return true
	return await client.sismember(QUEUE_SET_KEY, seriesId)
}

export async function enqueueSeries(
	seriesId: string
): Promise<{ enqueued: boolean; position: number | null }> {
	const client = await getKv()
	if (!client) return { enqueued: false, position: null }
	const active = await client.get(QUEUE_ACTIVE_KEY)
	if (active === seriesId) return { enqueued: false, position: 0 }

	const exists = await client.sismember(QUEUE_SET_KEY, seriesId)
	if (!exists) {
		await client.rpush(QUEUE_LIST_KEY, seriesId)
		await client.sadd(QUEUE_SET_KEY, seriesId)
	}
	return {
		enqueued: !exists,
		position: await getQueuePosition(seriesId),
	}
}

export async function dequeueNextSeries(): Promise<string | null> {
	const client = await getKv()
	if (!client) return null
	const next = await client.lpop(QUEUE_LIST_KEY)
	if (!next) return null
	await client.srem(QUEUE_SET_KEY, next)
	return next
}

export async function setActiveSeries(seriesId: string): Promise<void> {
	const client = await getKv()
	if (!client) return
	await client.set(QUEUE_ACTIVE_KEY, seriesId)
}

export async function clearActiveSeries(seriesId: string): Promise<void> {
	const client = await getKv()
	if (!client) return
	const active = await client.get(QUEUE_ACTIVE_KEY)
	if (active !== seriesId) return
	await client.del(QUEUE_ACTIVE_KEY)
}
