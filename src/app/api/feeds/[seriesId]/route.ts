import { NextRequest, NextResponse } from 'next/server'
import { getSeries } from '@/lib/caching'
import { assembleFeed, assemblePendingFeed } from '@/lib/rss'
import { inngest } from '@/inngest/client'
import { CACHE_CONTROL, EVENTS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ seriesId: string }> }
) {
	const { seriesId } = await params
	const t0 = Date.now()
	const series = await getSeries(seriesId, { onCacheMiss: 'trigger' })
	if (!series) {
		inngest
			.send({ name: EVENTS.SERIES_FETCH, data: { seriesId } })
			.catch((err) => console.warn('[feed] Inngest send failed:', err))
		const feed = assemblePendingFeed(seriesId)
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
