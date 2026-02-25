import { Redis } from '@upstash/redis'
import { createClient } from 'redis'
import type { Series } from './storage'
import { ENV, REDIS_KEYS } from './constants'

const KEY_PREFIX = REDIS_KEYS.SERIES_PREFIX
const LOCK_PREFIX = REDIS_KEYS.SERIES_LOCK_PREFIX
const PROGRESS_PREFIX = REDIS_KEYS.SERIES_PROGRESS_PREFIX
const QUEUE_ZSET_KEY = REDIS_KEYS.SERIES_QUEUE_ZSET
const QUEUE_ACTIVE_KEY = REDIS_KEYS.SERIES_QUEUE_ACTIVE
const QUEUE_KICK_LOCK_KEY = REDIS_KEYS.SERIES_QUEUE_KICK_LOCK

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

export type KvClient = {
	get: (key: string) => Promise<string | null>
	set: (key: string, value: string) => Promise<unknown>
	setEx: (key: string, value: string, ttlSeconds: number) => Promise<unknown>
	del: (key: string) => Promise<number>
	zaddNx: (key: string, score: number, member: string) => Promise<boolean>
	zrangeFirst: (key: string) => Promise<string | null>
	zrangeWithScores: (
		key: string,
		start: number,
		stop: number
	) => Promise<{ member: string; score: number }[]>
	zrank: (key: string, member: string) => Promise<number | null>
	zrem: (key: string, member: string) => Promise<number>
	zcard: (key: string) => Promise<number>
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
		zaddNx: async (k, score, member) => {
			const res = await redis.zadd(k, { nx: true }, { score, member })
			return Number(res) === 1
		},
		zrangeFirst: async (k) => {
			const first = await redis.zrange<string[]>(k, 0, 0)
			return first.at(0) ?? null
		},
		zrangeWithScores: async (k, start, stop) => {
			const raw = await redis.zrange(k, start, stop, { withScores: true })
			const arr = Array.isArray(raw) ? raw : []
			const out: { member: string; score: number }[] = []
			for (let i = 0; i < arr.length; i += 2) {
				const member = arr[i] as string
				const score = Number(arr[i + 1])
				if (member != null && Number.isFinite(score))
					out.push({ member, score })
			}
			return out
		},
		zrank: (k, member) => redis.zrank(k, member),
		zrem: async (k, member) => (await redis.zrem(k, member)) as number,
		zcard: (k) => redis.zcard(k),
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
		zaddNx: async (k, score, member) => {
			const added = await localClient!.zAdd(k, [{ score, value: member }], {
				NX: true,
			})
			return Number(added) === 1
		},
		zrangeFirst: async (k) =>
			(await localClient!.zRange(k, 0, 0)).at(0) ?? null,
		zrangeWithScores: async (k, start, stop) => {
			const raw = await localClient!.zRangeWithScores(k, start, stop)
			return raw.map((r: { value: string; score: number }) => ({
				member: r.value,
				score: r.score,
			}))
		},
		zrank: (k, member) => localClient!.zRank(k, member),
		zrem: (k, member) => localClient!.zRem(k, member),
		zcard: (k) => localClient!.zCard(k),
		setNxEx: async (k, v, ttlSeconds) => {
			const res = await localClient!.set(k, v, { NX: true, EX: ttlSeconds })
			return res === 'OK'
		},
	}
}

type QueueActiveClaim = {
	seriesId: string
	token: string
	claimedAt: string
}

function parseActiveClaim(raw: string | null): QueueActiveClaim | null {
	if (!raw) return null
	try {
		const parsed = JSON.parse(raw) as QueueActiveClaim
		if (!parsed?.seriesId || !parsed?.token) return null
		return parsed
	} catch {
		return null
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

export function __setKvForTests(client: KvClient | null): void {
	kv = client
}

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
	const active = parseActiveClaim(await client.get(QUEUE_ACTIVE_KEY))
	if (active?.seriesId === seriesId) return 0
	const rank = await client.zrank(QUEUE_ZSET_KEY, seriesId)
	return rank == null ? null : rank + 1
}

export async function isSeriesQueuedOrActive(
	seriesId: string
): Promise<boolean> {
	const client = await getKv()
	if (!client) return false
	const active = parseActiveClaim(await client.get(QUEUE_ACTIVE_KEY))
	if (active?.seriesId === seriesId) return true
	return (await client.zrank(QUEUE_ZSET_KEY, seriesId)) !== null
}

export async function enqueueSeries(
	seriesId: string
): Promise<{ enqueued: boolean; position: number | null }> {
	const client = await getKv()
	if (!client) return { enqueued: false, position: null }
	const active = parseActiveClaim(await client.get(QUEUE_ACTIVE_KEY))
	if (active?.seriesId === seriesId) return { enqueued: false, position: 0 }
	const enqueued = await client.zaddNx(QUEUE_ZSET_KEY, Date.now(), seriesId)
	return {
		enqueued,
		position: await getQueuePosition(seriesId),
	}
}

export async function claimNextSeries(): Promise<{
	seriesId: string
	token: string
} | null> {
	const client = await getKv()
	if (!client) return null
	const active = parseActiveClaim(await client.get(QUEUE_ACTIVE_KEY))
	if (active) return null

	const seriesId = await client.zrangeFirst(QUEUE_ZSET_KEY)
	if (!seriesId) return null

	const token = createLockToken()
	const claim: QueueActiveClaim = {
		seriesId,
		token,
		claimedAt: new Date().toISOString(),
	}
	const claimed = await client.setNxEx(
		QUEUE_ACTIVE_KEY,
		JSON.stringify(claim),
		ENV.SERIES_QUEUE_ACTIVE_TTL_SEC
	)
	if (!claimed) return null
	const removed = await client.zrem(QUEUE_ZSET_KEY, seriesId)
	if (removed === 0) {
		await finalizeSeriesClaim(seriesId, token, { requeue: false })
		return null
	}
	return { seriesId, token }
}

export async function finalizeSeriesClaim(
	seriesId: string,
	token: string,
	options?: { requeue?: boolean }
): Promise<void> {
	const client = await getKv()
	if (!client) return
	const active = parseActiveClaim(await client.get(QUEUE_ACTIVE_KEY))
	if (!active || active.seriesId !== seriesId || active.token !== token) return
	await client.del(QUEUE_ACTIVE_KEY)
	if (options?.requeue) {
		await client.zaddNx(QUEUE_ZSET_KEY, Date.now(), seriesId)
	}
}

export async function queueHasItems(): Promise<boolean> {
	const client = await getKv()
	if (!client) return false
	return (await client.zcard(QUEUE_ZSET_KEY)) > 0
}

export async function acquireQueueKickLock(): Promise<boolean> {
	const client = await getKv()
	if (!client) return false
	return await client.setNxEx(
		QUEUE_KICK_LOCK_KEY,
		createLockToken(),
		ENV.SERIES_QUEUE_KICK_LOCK_TTL_SEC
	)
}

export async function clearQueueAndLocks(): Promise<void> {
	const client = await getKv()
	if (!client) return
	await client.del(QUEUE_ZSET_KEY)
	await client.del(QUEUE_ACTIVE_KEY)
	await client.del(QUEUE_KICK_LOCK_KEY)
}

export type QueueStatus = {
	active: { seriesId: string; claimedAt: string } | null
	activeProgress: {
		completedBatches: number
		totalBatches: number
		completedEpisodes: number
		totalEpisodes: number
		status: string
	} | null
	queued: { seriesId: string; enqueuedAt: number }[]
	kickLocked: boolean
}

export async function getQueueStatus(): Promise<QueueStatus | null> {
	const client = await getKv()
	if (!client) return null
	const [activeRaw, queuedRaw, kickLockRaw] = await Promise.all([
		client.get(QUEUE_ACTIVE_KEY),
		client.zrangeWithScores(QUEUE_ZSET_KEY, 0, -1),
		client.get(QUEUE_KICK_LOCK_KEY),
	])
	const active = parseActiveClaim(activeRaw)
	let activeProgress: QueueStatus['activeProgress'] = null
	if (active) {
		const progress = await readSeriesFetchProgress(active.seriesId)
		if (progress) {
			activeProgress = {
				completedBatches: progress.completedBatches,
				totalBatches: progress.totalBatches,
				completedEpisodes: progress.completedEpisodes,
				totalEpisodes: progress.totalEpisodes,
				status: progress.status,
			}
		}
	}
	const queued = queuedRaw.map((r) => ({
		seriesId: r.member,
		enqueuedAt: Math.round(r.score),
	}))
	return {
		active: active
			? { seriesId: active.seriesId, claimedAt: active.claimedAt }
			: null,
		activeProgress,
		queued,
		kickLocked: kickLockRaw != null,
	}
}

export async function unblockQueue(): Promise<{
	unblocked: boolean
	queueLength: number
}> {
	const client = await getKv()
	if (!client) return { unblocked: false, queueLength: 0 }
	const queueLength = await client.zcard(QUEUE_ZSET_KEY)
	await client.del(QUEUE_ACTIVE_KEY)
	await client.del(QUEUE_KICK_LOCK_KEY)
	return { unblocked: true, queueLength }
}
