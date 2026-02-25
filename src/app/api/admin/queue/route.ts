import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'
import { EVENTS } from '@/lib/constants'
import { getQueueStatus, unblockQueue } from '@/lib/storage-api'

export const dynamic = 'force-dynamic'

function checkAdminAuth(req: NextRequest): boolean {
	const secret = process.env.ADMIN_SECRET
	if (!secret) return true
	const header = req.headers.get('X-Admin-Secret')
	const url = new URL(req.url)
	const querySecret = url.searchParams.get('secret')
	return header === secret || querySecret === secret
}

export async function GET(req: NextRequest) {
	if (!checkAdminAuth(req)) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}
	const status = await getQueueStatus()
	if (!status) {
		return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 })
	}
	return NextResponse.json(status)
}

export async function POST(req: NextRequest) {
	if (!checkAdminAuth(req)) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}
	const { unblocked, queueLength } = await unblockQueue()
	if (!unblocked) {
		return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 })
	}
	if (queueLength > 0) {
		try {
			await inngest.send({ name: EVENTS.SERIES_QUEUE_KICK, data: {} })
		} catch (err) {
			console.warn('[admin] Inngest send failed:', err)
		}
	}
	return NextResponse.json({ unblocked: true })
}
