import 'dotenv/config'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ENV } from '../src/lib/constants'
import { getSeries, listAllPodcastIds } from '../src/lib/nrk/nrk'
import * as storage from '../src/lib/storage-api'

const DELAY_MS = ENV.BACKFILL_DELAY_MS
const DELAY_JITTER = Math.min(1, Math.max(0, ENV.BACKFILL_DELAY_JITTER))
const SKIP_EXISTING = process.env.BACKFILL_SKIP_EXISTING !== 'false'
const PRIORITY_ONLY = process.env.BACKFILL_PRIORITY_ONLY === '1'

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms))
}

function delayWithJitter(baseMs: number): number {
	if (baseMs <= 0) return 0
	const spread = baseMs * DELAY_JITTER
	return Math.round(baseMs + (Math.random() * 2 - 1) * spread)
}

function loadPrioritySeries(): string[] {
	try {
		const path = join(__dirname, '../data/priority-series.json')
		const json = readFileSync(path, 'utf-8')
		const ids = JSON.parse(json) as string[]
		return Array.isArray(ids) ? ids : []
	} catch {
		return []
	}
}

async function main() {
	const hasRedis =
		process.env.REDIS_URL ||
		((process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
			(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN))
	if (!hasRedis) {
		console.error(
			'Redis not configured. Set REDIS_URL (local) or UPSTASH_REDIS_REST_* (production).'
		)
		process.exit(1)
	}

	const priorityIds = loadPrioritySeries()
	const singleId = process.env.BACKFILL_SERIES_ID ?? process.argv[2]
	let podcasts: { seriesId: string; title: string }[]
	if (singleId) {
		podcasts = [{ seriesId: singleId, title: singleId }]
		console.log('Single-series mode:', singleId)
	} else {
		console.log('Fetching podcast catalog from NRK...')
		podcasts = await listAllPodcastIds()
		console.log('Catalog loaded:', podcasts.length, 'podcasts')
	}

	if (!singleId && priorityIds.length > 0) {
		const prioritySet = new Set(priorityIds)
		const catalogMap = new Map(podcasts.map((p) => [p.seriesId, p]))
		const priority = priorityIds.map(
			(id) => catalogMap.get(id) ?? { seriesId: id, title: id }
		)
		const rest = podcasts.filter((p) => !prioritySet.has(p.seriesId))
		podcasts = PRIORITY_ONLY ? priority : [...priority, ...rest]
		if (PRIORITY_ONLY && podcasts.length > 0) {
			console.log(`Priority-only mode: ${podcasts.length} series`)
		}
	}
	const nrkDelay = process.env.NRK_FETCH_DELAY_MS ?? '0'
	console.log(
		`Delay: ${DELAY_MS}ms between series, NRK_FETCH_DELAY_MS: ${nrkDelay}ms, skip existing: ${SKIP_EXISTING}`
	)

	let done = 0
	let skipped = 0
	let failed = 0

	const total = podcasts.length
	const startAt = Date.now()
	console.log(`\n--- Backfill ${total} series ---\n`)

	for (let i = 0; i < total; i++) {
		const { seriesId, title } = podcasts[i]
		const progress = `[${i + 1}/${total}]`

		try {
			if (SKIP_EXISTING) {
				const existing = await storage.readSeries(seriesId)
				if (existing) {
					skipped++
					console.log(
						`${progress} Skip (cached): ${title} (${existing.episodes.length} eps)`
					)
					await sleep(delayWithJitter(DELAY_MS))
					continue
				}
			}

			console.log(`${progress} Fetching: ${title}...`)
			const series = await getSeries(seriesId)
			if (series) {
				const ok = await storage.writeSeries(series)
				done++
				const persist = ok ? 'stored' : 'NOT stored'
				const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
				const eta =
					total > 1
						? `eta ~${Math.round((((Date.now() - startAt) / (i + 1)) * (total - i - 1)) / 1000)}s`
						: ''
				console.log(
					`${progress} OK (${persist}): ${title} (${series.episodes.length} episodes) ${elapsed}s ${eta}`.trim()
				)
			} else {
				failed++
				console.error(`${progress} No data: ${seriesId} (${title})`)
			}
		} catch (err) {
			failed++
			const msg = err instanceof Error ? err.message : String(err)
			console.error(`${progress} Failed: ${seriesId} (${title}): ${msg}`)
		}
		await sleep(delayWithJitter(DELAY_MS))
	}

	const totalSec = ((Date.now() - startAt) / 1000).toFixed(1)
	console.log(
		`Done in ${totalSec}s. Fetched: ${done}, skipped: ${skipped}, failed: ${failed}`
	)
	await storage.disconnect()
	process.exit(0)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
