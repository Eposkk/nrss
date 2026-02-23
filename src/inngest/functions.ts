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
const MAX_QUEUE_ITEMS_PER_RUN = 500

async function runSeriesFetch(
	step: { run: Function; sleep: Function },
	seriesId: string,
	queueIndex: number
) {
	const prefix = `series-${queueIndex}`
	const catalog = await step.run(`${prefix}-get-catalog`, async () => {
		return await getSeriesCatalog(seriesId)
	})
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
		const playbackBatch = await step.run(
			`${prefix}-fetch-batch-${i}`,
			async () => {
				return await fetchPlaybackUrlsBatch(
					catalog.episodeResources.slice(start, end),
					catalog.type,
					{ delayPerRequest: false }
				)
			}
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

export const fetchSeriesQueueWorker = inngest.createFunction(
	{
		id: 'fetch-series-queue-worker',
		concurrency: { limit: 1 },
		retries: 2,
	},
	{ event: EVENTS.SERIES_QUEUE_KICK },
	async ({ step }) => {
		let processed = 0
		for (let i = 0; i < MAX_QUEUE_ITEMS_PER_RUN; i++) {
			const seriesId = await step.run(`queue-dequeue-${i}`, async () => {
				return await storage.dequeueNextSeries()
			})
			if (!seriesId) break
			processed++
			await step.run(`queue-set-active-${i}`, async () => {
				await storage.setActiveSeries(seriesId)
			})
			try {
				await runSeriesFetch(step, seriesId, i)
			} finally {
				await step.run(`queue-clear-active-${i}`, async () => {
					await storage.clearActiveSeries(seriesId)
				})
			}
		}
		return { processed }
	}
)
