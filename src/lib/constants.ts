export const EVENTS = {
	SERIES_FETCH: 'nrss/series.fetch',
	SERIES_QUEUE_KICK: 'nrss/series.queue.kick',
} as const

export const REDIS_KEYS = {
	SERIES_PREFIX: 'series:',
	SERIES_LOCK_PREFIX: 'series-lock:',
	SERIES_PROGRESS_PREFIX: 'series-progress:',
	SERIES_QUEUE_LIST: 'series-queue',
	SERIES_QUEUE_SET: 'series-queue-set',
	SERIES_QUEUE_ACTIVE: 'series-queue-active',
} as const

export const CACHE_CONTROL = {
	FEED_PENDING: 'no-store, max-age=0, must-revalidate',
	FEED_READY: 'public, max-age=7200',
} as const

export const DEFAULTS = {
	SYNC_INTERVAL_HOURS: 1,
	MAX_SERIES_BYTES: 65_536,
	SERIES_FETCH_LOCK_TTL_SEC: 1800,
	SERIES_PROGRESS_TTL_SEC: 3600,
	NRK_FETCH_BATCH_SIZE: 10,
	NRK_FETCH_BATCH_DELAY_MS: 10000,
	NRK_FETCH_DELAY_MS: 0,
	NRK_FETCH_DELAY_JITTER: 0.5,
	BACKFILL_DELAY_MS: 10000,
	BACKFILL_DELAY_JITTER: 0.5,
	BACKFILL_VERBOSE: '1',
} as const

export const NRK = {
	API_BASE_URL: 'https://psapi.nrk.no',
} as const

function parseIntEnv(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? '', 10)
	return Number.isFinite(parsed) ? parsed : fallback
}

function parseFloatEnv(value: string | undefined, fallback: number): number {
	const parsed = Number.parseFloat(value ?? '')
	return Number.isFinite(parsed) ? parsed : fallback
}

export const ENV = {
	NRK_FETCH_DELAY_MS: parseIntEnv(
		process.env.NRK_FETCH_DELAY_MS,
		DEFAULTS.NRK_FETCH_DELAY_MS
	),
	NRK_FETCH_DELAY_JITTER: parseFloatEnv(
		process.env.NRK_FETCH_DELAY_JITTER,
		DEFAULTS.NRK_FETCH_DELAY_JITTER
	),
	NRK_FETCH_BATCH_SIZE: parseIntEnv(
		process.env.NRK_FETCH_BATCH_SIZE,
		DEFAULTS.NRK_FETCH_BATCH_SIZE
	),
	NRK_FETCH_BATCH_DELAY_MS: parseIntEnv(
		process.env.NRK_FETCH_BATCH_DELAY_MS,
		DEFAULTS.NRK_FETCH_BATCH_DELAY_MS
	),
	SERIES_FETCH_LOCK_TTL_SEC: parseIntEnv(
		process.env.SERIES_FETCH_LOCK_TTL_SEC,
		DEFAULTS.SERIES_FETCH_LOCK_TTL_SEC
	),
	SERIES_PROGRESS_TTL_SEC: parseIntEnv(
		process.env.SERIES_PROGRESS_TTL_SEC,
		DEFAULTS.SERIES_PROGRESS_TTL_SEC
	),
	BACKFILL_DELAY_MS: parseIntEnv(
		process.env.BACKFILL_DELAY_MS,
		DEFAULTS.BACKFILL_DELAY_MS
	),
	BACKFILL_DELAY_JITTER: parseFloatEnv(
		process.env.BACKFILL_DELAY_JITTER,
		DEFAULTS.BACKFILL_DELAY_JITTER
	),
} as const
