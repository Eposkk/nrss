import test from 'node:test'
import assert from 'node:assert/strict'
import { handleQueueOnCacheMiss } from './route'
import type { SeriesFetchProgress } from '@/lib/storage-api'

test('handleQueueOnCacheMiss does not overwrite running progress', async () => {
	let writes = 0

	await handleQueueOnCacheMiss('series-a', {
		enqueue: async () => ({ enqueued: true, position: 2 }),
		readProgress: async () =>
			({
				status: 'running',
				queuePosition: 0,
				totalBatches: 3,
				completedBatches: 1,
				totalEpisodes: 30,
				completedEpisodes: 10,
				updatedAt: new Date().toISOString(),
			}) satisfies SeriesFetchProgress,
		writeProgress: async () => {
			writes += 1
		},
		acquireKickLock: async () => false,
		sendKick: async () => {},
	})

	assert.equal(writes, 0)
})

test('handleQueueOnCacheMiss dedupes queue kick by lock', async () => {
	let sent = 0

	await handleQueueOnCacheMiss('series-a', {
		enqueue: async () => ({ enqueued: true, position: 1 }),
		readProgress: async () => null,
		writeProgress: async () => {},
		acquireKickLock: async () => false,
		sendKick: async () => {
			sent += 1
		},
	})

	assert.equal(sent, 0)
})

test('parallel uncached requests for same series enqueue once', async () => {
	const enqueued = new Set<string>()
	let kickLocked = false
	let kicks = 0
	let writes = 0

	const enqueue = async (seriesId: string) => {
		const wasNew = !enqueued.has(seriesId)
		if (wasNew) enqueued.add(seriesId)
		return { enqueued: wasNew, position: 1 }
	}

	await Promise.all(
		Array.from({ length: 10 }).map(() =>
			handleQueueOnCacheMiss('series-a', {
				enqueue,
				readProgress: async () => null,
				writeProgress: async () => {
					writes += 1
				},
				acquireKickLock: async () => {
					if (kickLocked) return false
					kickLocked = true
					return true
				},
				sendKick: async () => {
					kicks += 1
				},
			})
		)
	)

	assert.equal(enqueued.size, 1)
	assert.equal(kicks, 1)
	assert.equal(writes, 10)
})

test('parallel uncached requests for different series enqueue each series once', async () => {
	const enqueued = new Set<string>()
	let kickLocked = false
	let kicks = 0

	const enqueue = async (seriesId: string) => {
		const wasNew = !enqueued.has(seriesId)
		if (wasNew) enqueued.add(seriesId)
		return { enqueued: wasNew, position: wasNew ? enqueued.size : 1 }
	}

	await Promise.all(
		['series-a', 'series-b', 'series-c', 'series-d', 'series-e'].map(
			(seriesId) =>
				handleQueueOnCacheMiss(seriesId, {
					enqueue,
					readProgress: async () => null,
					writeProgress: async () => {},
					acquireKickLock: async () => {
						if (kickLocked) return false
						kickLocked = true
						return true
					},
					sendKick: async () => {
						kicks += 1
					},
				})
		)
	)

	assert.equal(enqueued.size, 5)
	assert.equal(kicks, 1)
})
