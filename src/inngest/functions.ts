import { inngest } from './client'
import {
	fetchPlaybackUrlsBatch,
	getSeriesCatalog,
	type PlaybackResolvedEpisode,
	parseSeries,
} from '@/lib/nrk/nrk'
import * as storage from '@/lib/storage-api'
import { ENV, EVENTS } from '@/lib/constants'

const BATCH_SIZE = Math.max(1, ENV.NRK_FETCH_BATCH_SIZE)
const STEP_SLEEP_DURATION =
	ENV.NRK_FETCH_BATCH_DELAY_MS > 0 ? `${ENV.NRK_FETCH_BATCH_DELAY_MS}ms` : null

async function runSeriesFetch(
	step: { run: Function; sleep: Function },
	seriesId: string,
	queueIndex: number
): Promise<RunSeriesFetchResult> {
	const prefix = `series-${queueIndex}`
	const catalog = await getSeriesCatalog(seriesId)
	if (!catalog) {
		await step.run(`${prefix}-progress-failed-no-data`, async () => {
			await storage.writeSeriesFetchProgress(seriesId, {
				status: 'failed',
				queuePosition: undefined,
				totalBatches: 0,
				completedBatches: 0,
				totalEpisodes: 0,
				completedEpisodes: 0,
				message: 'Fant ingen data for serien hos NRK.',
				updatedAt: new Date().toISOString(),
			})
		})
		return { stored: false, reason: 'no_data' as const }
	}

	const batchCount = Math.ceil(catalog.episodeResources.length / BATCH_SIZE)
	await step.run(`${prefix}-progress-running`, async () => {
		await storage.writeSeriesFetchProgress(seriesId, {
			status: 'running',
			queuePosition: 0,
			totalBatches: batchCount,
			completedBatches: 0,
			totalEpisodes: catalog.episodeResources.length,
			completedEpisodes: 0,
			message: 'Henter episoder...',
			updatedAt: new Date().toISOString(),
		})
	})

	const episodes: PlaybackResolvedEpisode[] = []
	for (let i = 0; i < batchCount; i++) {
		const start = i * BATCH_SIZE
		const end = start + BATCH_SIZE
		const playbackBatch = await fetchPlaybackUrlsBatch(
			catalog.episodeResources.slice(start, end),
			catalog.type,
			{ delayPerRequest: false }
		)
		episodes.push(...playbackBatch)
		const completedBatches = i + 1
		await step.run(`${prefix}-progress-batch-${i}`, async () => {
			await storage.writeSeriesFetchProgress(seriesId, {
				status: 'running',
				queuePosition: 0,
				totalBatches: batchCount,
				completedBatches,
				totalEpisodes: catalog.episodeResources.length,
				completedEpisodes: Math.min(
					completedBatches * BATCH_SIZE,
					catalog.episodeResources.length
				),
				message: 'Henter episoder...',
				updatedAt: new Date().toISOString(),
			})
		})
		if (STEP_SLEEP_DURATION && i < batchCount - 1) {
			await step.sleep(`${prefix}-rate-limit-${i}`, STEP_SLEEP_DURATION)
		}
	}

	if (episodes.length === 0) {
		await step.run(`${prefix}-progress-failed-no-playable`, async () => {
			await storage.writeSeriesFetchProgress(seriesId, {
				status: 'failed',
				queuePosition: undefined,
				totalBatches: batchCount,
				completedBatches: batchCount,
				totalEpisodes: catalog.episodeResources.length,
				completedEpisodes: catalog.episodeResources.length,
				message: 'Fant ingen avspillbare episoder for serien.',
				updatedAt: new Date().toISOString(),
			})
		})
		return { stored: false, reason: 'no_playable_episodes' as const }
	}

	const series = parseSeries({ series: catalog.series, episodes })
	const ok = await step.run(`${prefix}-persist-to-redis`, async () => {
		return await storage.writeSeries(series)
	})
	if (!ok) console.warn('[inngest] Failed to persist:', seriesId)
	await step.run(`${prefix}-progress-clear-success`, async () => {
		await storage.clearSeriesFetchProgress(seriesId)
	})
	return { stored: true, episodes: series.episodes.length }
}

type StepApi = { run: Function; sleep: Function }
type RunSeriesFetchResult =
	| { stored: false; reason: 'no_data' | 'no_playable_episodes' }
	| { stored: true; episodes: number }
type QueueWorkerStorageDeps = {
	claimNextSeries: typeof storage.claimNextSeries
	finalizeSeriesClaim: typeof storage.finalizeSeriesClaim
	queueHasItems: typeof storage.queueHasItems
	acquireQueueKickLock: typeof storage.acquireQueueKickLock
	writeSeriesFetchProgress: typeof storage.writeSeriesFetchProgress
}

export async function processQueueKick(
	step: StepApi,
	deps?: {
		storageApi?: QueueWorkerStorageDeps
		sendEvent?: () => Promise<void>
		runSeriesFetchFn?: (
			stepApi: StepApi,
			seriesId: string,
			queueIndex: number
		) => Promise<RunSeriesFetchResult>
	}
) {
	const storageApi: QueueWorkerStorageDeps = deps?.storageApi ?? storage
	const sendEvent =
		deps?.sendEvent ?? (async () => inngest.send({ name: EVENTS.SERIES_QUEUE_KICK, data: {} }))
	const runSeriesFetchFn: (
		stepApi: StepApi,
		seriesId: string,
		queueIndex: number
	) => Promise<RunSeriesFetchResult> = deps?.runSeriesFetchFn ?? runSeriesFetch

	const claim = await step.run('queue-claim-next', async () => {
		return await storageApi.claimNextSeries()
	})
	if (!claim) return { processed: 0 }

	let result: RunSeriesFetchResult
	try {
		result = await runSeriesFetchFn(step, claim.seriesId, 0)
	} catch (err) {
		await step.run('queue-progress-failed-unexpected', async () => {
			await storageApi.writeSeriesFetchProgress(claim.seriesId, {
				status: 'failed',
				queuePosition: undefined,
				totalBatches: 0,
				completedBatches: 0,
				totalEpisodes: 0,
				completedEpisodes: 0,
				message: 'Uventet feil under henting. Prøv igjen om litt.',
				updatedAt: new Date().toISOString(),
			})
		})
		console.error('[inngest] Unexpected series fetch error:', claim.seriesId, err)
		result = { stored: false, reason: 'no_data' }
	} finally {
		await step.run('queue-finalize-claim', async () => {
			await storageApi.finalizeSeriesClaim(claim.seriesId, claim.token, {
				requeue: false,
			})
		})
	}

	const hasMore = await step.run('queue-has-items', async () => {
		return await storageApi.queueHasItems()
	})
	if (hasMore) {
		await step.run('queue-kick-next', async () => {
			const shouldKick = await storageApi.acquireQueueKickLock()
			if (!shouldKick) return
			await sendEvent()
		})
	}
	return { processed: 1, result }
}

export const fetchSeriesQueueWorker = inngest.createFunction(
	{
		id: 'fetch-series-queue-worker',
		concurrency: { limit: 1 },
		retries: 0,
	},
	{ event: EVENTS.SERIES_QUEUE_KICK },
	async ({ step }) => {
		return await processQueueKick(step)
	}
)
