# NRSS (Next.js)

NRK podcast RSS feeds. Search for NRK podcasts and get RSS feeds for any podcast player.

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

Without Redis, the app still works; series are fetched from NRK API on each request (no caching).

## Run

```bash
pnpm dev
```

Deploy to Vercel: connect the repo and add the env vars above.

## Backfill

Pre-populate Redis with all NRK podcasts. Requires Redis (e.g. `docker compose up -d` and `REDIS_URL=redis://localhost:6380`):

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
