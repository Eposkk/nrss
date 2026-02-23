import { Redis } from '@upstash/redis'
import { createClient } from 'redis'
import type { Series } from './storage'
import { REDIS_KEYS } from './constants'

const KEY_PREFIX = REDIS_KEYS.SERIES_PREFIX
const LOCK_PREFIX = REDIS_KEYS.SERIES_LOCK_PREFIX
const PROGRESS_PREFIX = REDIS_KEYS.SERIES_PROGRESS_PREFIX

export type SeriesFetchProgress = {
	status: 'queued' | 'running' | 'failed'
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
	del: (key: string) => Promise<number>
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
		del: (k) => redis.del(k),
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
		del: (k) => localClient!.del(k),
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
	await client.set(`${PROGRESS_PREFIX}${seriesId}`, JSON.stringify(progress))
}

export async function clearSeriesFetchProgress(
	seriesId: string
): Promise<void> {
	const client = await getKv()
	if (!client) return
	await client.del(`${PROGRESS_PREFIX}${seriesId}`)
}
