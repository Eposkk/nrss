import { NextRequest, NextResponse } from 'next/server'
import { getSeries } from '@/lib/caching'
import { assembleFeed, assemblePendingFeed } from '@/lib/rss'
import { inngest } from '@/inngest/client'
import { CACHE_CONTROL, EVENTS } from '@/lib/constants'
import {
	readSeriesFetchProgress,
	type SeriesFetchProgress,
} from '@/lib/storage-api'

export const dynamic = 'force-dynamic'

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ seriesId: string }> }
) {
	const { seriesId } = await params
	const t0 = Date.now()
	const series = await getSeries(seriesId, { onCacheMiss: 'trigger' })
	if (!series) {
		try {
			await inngest.send({ name: EVENTS.SERIES_FETCH, data: { seriesId } })
		} catch (err) {
			console.warn('[feed] Inngest send failed:', err)
		}
		const progress = await readSeriesFetchProgress(seriesId)
		const feed = assemblePendingFeed(
			seriesId,
			undefined,
			describeProgress(progress)
		)
		console.log('[feed] 202 (fetching):', seriesId, `${Date.now() - t0}ms`)
		return new NextResponse(feed, {
			status: 200,
			headers: {
				'Content-Type': 'application/xml',
				'Cache-Control': CACHE_CONTROL.FEED_PENDING,
			},
		})
	}
	const feed = assembleFeed(series)
	console.log(
		'[feed] 200:',
		seriesId,
		`${series.episodes.length} eps`,
		`${Date.now() - t0}ms`
	)
	return new NextResponse(feed, {
		status: 200,
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': CACHE_CONTROL.FEED_READY,
		},
	})
}

function describeProgress(
	progress: SeriesFetchProgress | null
): string | undefined {
	if (!progress) return undefined
	if (progress.status === 'failed') {
		return progress.message ?? 'Henting feilet. Prøv på nytt om litt.'
	}
	if (progress.status === 'queued') {
		return (
			progress.message ?? 'Klargjør henting av episoder. Prøv igjen straks.'
		)
	}
	if (progress.totalBatches > 0 && progress.totalEpisodes > 0) {
		return `Henter episoder fra NRK: batch ${progress.completedBatches}/${progress.totalBatches}, episoder ${progress.completedEpisodes}/${progress.totalEpisodes}.`
	}
	return (
		progress.message ??
		'Henter episoder fra NRK. Prøv å oppdatere på nytt om 30–60 sekunder.'
	)
}
