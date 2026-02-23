import test from 'node:test'
import assert from 'node:assert/strict'
import { processQueueKick } from './functions'
import type { SeriesFetchProgress } from '@/lib/storage-api'

const step = {
	run: async <T>(_name: string, fn: () => Promise<T>): Promise<T> => await fn(),
	sleep: async () => {},
}

test('processQueueKick no-ops when queue empty', async () => {
	let sent = 0
	const result = await processQueueKick(step, {
		storageApi: {
			claimNextSeries: async () => null,
			finalizeSeriesClaim: async () => {},
			queueHasItems: async () => false,
			acquireQueueKickLock: async () => false,
			writeSeriesFetchProgress: async (_seriesId: string, _progress: SeriesFetchProgress) => {},
		},
		sendEvent: async () => {
			sent += 1
		},
		runSeriesFetchFn: async () => ({ stored: true, episodes: 0 }),
	})

	assert.equal(result.processed, 0)
	assert.equal(sent, 0)
})

test('processQueueKick finalizes and chains when queue has more items', async () => {
	let finalized = 0
	let sent = 0
	const result = await processQueueKick(step, {
		storageApi: {
			claimNextSeries: async () => ({ seriesId: 'series-a', token: 'tok-1' }),
			finalizeSeriesClaim: async (
				seriesId: string,
				token: string,
				options?: { requeue?: boolean }
			) => {
				assert.equal(seriesId, 'series-a')
				assert.equal(token, 'tok-1')
				assert.equal(options?.requeue, false)
				finalized += 1
			},
			queueHasItems: async () => true,
			acquireQueueKickLock: async () => true,
			writeSeriesFetchProgress: async (_seriesId: string, _progress: SeriesFetchProgress) => {},
		},
		sendEvent: async () => {
			sent += 1
		},
		runSeriesFetchFn: async () => ({ stored: true, episodes: 10 }),
	})

	assert.equal(result.processed, 1)
	assert.equal(finalized, 1)
	assert.equal(sent, 1)
})

test('processQueueKick requeues current series on unexpected failure', async () => {
	let requeueFlag: boolean | undefined
	const result = await processQueueKick(step, {
		storageApi: {
			claimNextSeries: async () => ({ seriesId: 'series-a', token: 'tok-1' }),
			finalizeSeriesClaim: async (
				_seriesId: string,
				_token: string,
				options?: { requeue?: boolean }
			) => {
				requeueFlag = options?.requeue
			},
			queueHasItems: async () => false,
			acquireQueueKickLock: async () => false,
			writeSeriesFetchProgress: async (_seriesId: string, _progress: SeriesFetchProgress) => {},
		},
		sendEvent: async () => {},
		runSeriesFetchFn: async () => {
			throw new Error('boom')
		},
	})

	assert.equal(result.processed, 1)
	assert.equal(requeueFlag, true)
})
