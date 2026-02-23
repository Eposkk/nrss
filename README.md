# NRSS (Next.js) Fork of NRSS by olaven (Olav Sundfør)

NRK podcast RSS feeds. Search for NRK podcasts and get RSS feeds for any podcast player.

## What this fork adds

Compared to the original project, this fork adds:

- KV-backed feed caching (local Redis or Upstash or similar)
- Background fetch on cache miss via Inngest (returns a temporary feed while loading)
- Batch-based episode fetching with rate limiting between batches (to reduce the risk of NRK API rate limiting)
- KV progress tracking for in-flight background fetches
- Incremental stale refresh: on new requests when cache is older than 1 hour, only new episodes are fetched and merged

## Setup

**Local dev (Docker):**

```bash
docker compose up -d
```

Then set `REDIS_URL=redis://localhost:6380` (or use `.env` with REDIS_URL).

**Production (Vercel):**

1. Create an [Upstash Redis](https://upstash.com) database (free tier works).
2. In Vercel: Integrations → Storage → add Upstash Redis.
3. Set `NEXT_PUBLIC_APP_URL` to your deployment URL.
4. Add the environment variables from .env.example

Without Redis, the app still works; series are fetched from NRK API on each request (no caching).

## How cache + background fetch works

1. First request for a series (cache miss) triggers a background fetch.
2. While fetching, the feed endpoint returns a temporary RSS response.
3. Reloading the same URL shows progress from Redis until fetch is complete.
4. Once done, the full feed is served from Redis.
5. If cache is older than 1 hour, a stale refresh runs and merges only newly published episodes.

## Run

```bash
pnpm dev
```

## Backfill

Pre-populate Redis with all NRK podcasts. This process may trigger NRK API rate limiting, so use conservative delay settings. Requires Redis (e.g. `docker compose up -d` and `REDIS_URL=redis://localhost:6380`):

```bash
# 2s delay between requests (default), skip already-stored
pnpm backfill

# Single podcast (by series ID)
pnpm backfill <seriesId>

# Verbose (log each catalog page and playback batch)
BACKFILL_VERBOSE=1 pnpm backfill radioresepsjonen
# or
BACKFILL_SERIES_ID=radioresepsjonen pnpm backfill

# Custom delay (ms)
BACKFILL_DELAY_MS=3000 pnpm backfill

# Re-fetch existing
BACKFILL_SKIP_EXISTING=false pnpm backfill
```

## Limitations

- This service depends on NRK’s internal/public API structure. If NRK changes endpoints, response fields, IDs, playback manifests, or URL formats, feed generation can break.
- Cached data reflects what was valid at fetch time. If NRK later invalidates or changes media URLs, previously cached episode URLs may stop working.
- Episode updates are near-real-time, not instant. New episodes appear after refresh jobs run.
- This is a best-effort compatibility layer, not an official NRK API.
