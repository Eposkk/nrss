import test from 'node:test'
import assert from 'node:assert/strict'
import {
	__setKvForTests,
	acquireQueueKickLock,
	claimNextSeries,
	enqueueSeries,
	finalizeSeriesClaim,
	getQueuePosition,
	type KvClient,
} from './storage-api'

class MemoryKv implements KvClient {
	private readonly strings = new Map<string, string>()
	private readonly sortedSets = new Map<string, Map<string, number>>()

	async get(key: string): Promise<string | null> {
		return this.strings.get(key) ?? null
	}

	async set(key: string, value: string): Promise<unknown> {
		this.strings.set(key, value)
		return 'OK'
	}

	async setEx(key: string, value: string): Promise<unknown> {
		this.strings.set(key, value)
		return 'OK'
	}

	async del(key: string): Promise<number> {
		return this.strings.delete(key) ? 1 : 0
	}

	async zaddNx(key: string, score: number, member: string): Promise<boolean> {
		const set = this.ensureZset(key)
		if (set.has(member)) return false
		set.set(member, score)
		return true
	}

	async zrangeFirst(key: string): Promise<string | null> {
		const set = this.sortedSets.get(key)
		if (!set || set.size === 0) return null
		const entries = [...set.entries()].sort((a, b) => {
			if (a[1] !== b[1]) return a[1] - b[1]
			return a[0].localeCompare(b[0])
		})
		return entries[0]?.[0] ?? null
	}

	async zrank(key: string, member: string): Promise<number | null> {
		const set = this.sortedSets.get(key)
		if (!set || !set.has(member)) return null
		const entries = [...set.entries()].sort((a, b) => {
			if (a[1] !== b[1]) return a[1] - b[1]
			return a[0].localeCompare(b[0])
		})
		const idx = entries.findIndex(([m]) => m === member)
		return idx === -1 ? null : idx
	}

	async zrem(key: string, member: string): Promise<number> {
		const set = this.sortedSets.get(key)
		if (!set) return 0
		return set.delete(member) ? 1 : 0
	}

	async zcard(key: string): Promise<number> {
		return this.sortedSets.get(key)?.size ?? 0
	}

	async setNxEx(key: string, value: string): Promise<boolean> {
		if (this.strings.has(key)) return false
		this.strings.set(key, value)
		return true
	}

	private ensureZset(key: string): Map<string, number> {
		const existing = this.sortedSets.get(key)
		if (existing) return existing
		const created = new Map<string, number>()
		this.sortedSets.set(key, created)
		return created
	}
}

function useMemoryKv(): void {
	__setKvForTests(new MemoryKv())
}

test('enqueueSeries dedupes and returns stable position', async () => {
	useMemoryKv()

	const first = await enqueueSeries('a')
	assert.equal(first.enqueued, true)
	assert.equal(first.position, 1)

	const dup = await enqueueSeries('a')
	assert.equal(dup.enqueued, false)
	assert.equal(dup.position, 1)

	const second = await enqueueSeries('b')
	assert.equal(second.enqueued, true)
	assert.equal(second.position, 2)
})

test('claimNextSeries returns oldest and sets active position to 0', async () => {
	useMemoryKv()
	await enqueueSeries('a')
	await enqueueSeries('b')

	const claim = await claimNextSeries()
	assert.ok(claim)
	assert.equal(claim.seriesId, 'a')

	const activePos = await getQueuePosition('a')
	assert.equal(activePos, 0)

	const queuedPos = await getQueuePosition('b')
	assert.equal(queuedPos, 1)
})

test('finalizeSeriesClaim requires matching token', async () => {
	useMemoryKv()
	await enqueueSeries('a')
	const claim = await claimNextSeries()
	assert.ok(claim)

	await finalizeSeriesClaim('a', 'wrong-token', { requeue: true })
	const stillActive = await getQueuePosition('a')
	assert.equal(stillActive, 0)

	await finalizeSeriesClaim('a', claim.token, { requeue: true })
	const requeued = await getQueuePosition('a')
	assert.equal(requeued, 1)
})

test('acquireQueueKickLock only grants first caller', async () => {
	useMemoryKv()

	const first = await acquireQueueKickLock()
	const second = await acquireQueueKickLock()
	assert.equal(first, true)
	assert.equal(second, false)
})

test('queue dedupes across multiple series under concurrent mixed requests', async () => {
	useMemoryKv()

	const requests = [
		'series-a',
		'series-b',
		'series-a',
		'series-c',
		'series-b',
		'series-d',
		'series-c',
		'series-e',
		'series-d',
		'series-e',
	]

	const enqueueResults = await Promise.all(
		requests.map(async (seriesId) => {
			const result = await enqueueSeries(seriesId)
			return { seriesId, ...result }
		})
	)

	const claimed: string[] = []
	for (;;) {
		const next = await claimNextSeries()
		if (!next) break
		claimed.push(next.seriesId)
		await finalizeSeriesClaim(next.seriesId, next.token)
	}

	const uniqueRequested = [...new Set(requests)].sort()
	const uniqueClaimed = [...new Set(claimed)].sort()
	const newlyEnqueued = enqueueResults.filter((r) => r.enqueued).map((r) => r.seriesId)

	assert.deepEqual(uniqueClaimed, uniqueRequested)
	assert.equal(claimed.length, uniqueRequested.length)
	assert.equal(newlyEnqueued.length, uniqueRequested.length)
})
