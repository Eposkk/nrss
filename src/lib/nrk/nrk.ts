import type { Series } from "../storage"
import type { SearchSeriesResult } from "./types"

const NRK_API = "https://psapi.nrk.no"
const NRK_FETCH_DELAY_MS = parseInt(process.env.NRK_FETCH_DELAY_MS ?? "0", 10)
const NRK_FETCH_DELAY_JITTER = Math.min(
  1,
  Math.max(0, parseFloat(process.env.NRK_FETCH_DELAY_JITTER ?? "0.5")),
)

function sleep(ms: number) {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve()
}

function delayWithJitter(baseMs: number): number {
  if (baseMs <= 0) return 0
  const spread = baseMs * NRK_FETCH_DELAY_JITTER
  return Math.round(baseMs + (Math.random() * 2 - 1) * spread)
}

type CatalogImage = { url: string; width?: number }[]
type CatalogTitles = { title: string; subtitle?: string | null }
type HalLinkShare = { href: string; templated?: boolean }

export type EpisodeHalResource = {
  id: string
  episodeId: string
  date: string
  titles: CatalogTitles
  durationInSeconds: number
  _links: { share?: HalLinkShare }
}

type SeasonEpisodes = {
  _embedded?: {
    episodes?: { _embedded?: { episodes?: EpisodeHalResource[] } }
  }
}

type SeriesViewModel = {
  id: string
  titles: CatalogTitles
  squareImage?: CatalogImage
}

type CatalogSeries = {
  series: SeriesViewModel
  seriesType: string
  type: "series" | "podcast"
  _links?: { seasons?: { href: string; name: string; title: string }[] }
}

type EpisodesResponse = {
  _embedded?: {
    episodes?: EpisodeHalResource[]
  }
  _links?: { next?: { href: string } }
}

type PlaybackManifest = {
  playable?: { assets: { url: string }[] }
}

export type PlaybackResolvedEpisode = {
  url: string
  id: string
  titles: CatalogTitles
  date: string
  durationInSeconds: number
  _links: { share?: HalLinkShare }
}

export type NrkSeriesCatalog = {
  series: SeriesViewModel
  type: "series" | "podcast"
  episodeResources: EpisodeHalResource[]
}

type FetchOptions = {
  skipDelay?: boolean
}

async function fetchJson<T>(
  url: string,
  options?: FetchOptions,
): Promise<{ status: number; body: T }> {
  const res = await fetch(url)
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After")
    console.warn(
      "[NRK] Rate limited (429)",
      retryAfter ? `Retry-After: ${retryAfter}s` : "",
      url,
    )
  }
  const body = (await res.json().catch(() => null)) as T
  if (!options?.skipDelay) {
    await sleep(delayWithJitter(NRK_FETCH_DELAY_MS))
  }
  return { status: res.status, body }
}

type CategorySeriesItem = {
  id: string
  seriesId?: string
  type: string
  title: string
}

type CategoryResponse = {
  series?: CategorySeriesItem[]
  totalCount?: number
  _links?: { nextPage?: { href: string } }
}

export async function listPodcastsFromCategory(options?: {
  take?: number
  skip?: number
}): Promise<{ seriesId: string; title: string }[]> {
  const take = options?.take ?? 100
  const skip = options?.skip ?? 0
  const url = `${NRK_API}/radio/search/categories/podcast?take=${take}&skip=${skip}`
  const { status, body } = await fetchJson<CategoryResponse>(url)
  if (status !== 200 || !body?.series) return []
  return body.series
    .map((s) => ({ seriesId: s.seriesId ?? s.id, title: s.title }))
    .filter((s) => s.seriesId)
}

export async function listAllPodcastIds(): Promise<
  { seriesId: string; title: string }[]
> {
  const all: { seriesId: string; title: string }[] = []
  let skip = 0
  const take = 100
  while (true) {
    const batch = await listPodcastsFromCategory({ take, skip })
    if (batch.length === 0) break
    all.push(...batch)
    if (batch.length < take) break
    skip += take
  }
  const seen = new Set<string>()
  return all.filter((p) => {
    if (seen.has(p.seriesId)) return false
    seen.add(p.seriesId)
    return true
  })
}

export async function search(
  query: string,
): Promise<SearchSeriesResult[] | null> {
  if (!query.trim()) return null
  const { status, body } = await fetchJson<{
    results: { series?: { results?: SearchSeriesResult[] } }
  }>(`${NRK_API}/radio/search/search?q=${encodeURIComponent(query)}`)
  if (status === 200 && body?.results?.series?.results) {
    return body.results.series.results
  }
  return null
}

async function getPlaybackUrl(
  episodeId: string,
  type: "series" | "podcast",
  options?: FetchOptions,
): Promise<string | null> {
  const endpoints = [
    type === "podcast"
      ? `${NRK_API}/playback/manifest/podcast/${episodeId}`
      : `${NRK_API}/playback/manifest/program/${episodeId}`,
    type === "podcast"
      ? `${NRK_API}/playback/manifest/program/${episodeId}`
      : `${NRK_API}/playback/manifest/podcast/${episodeId}`,
    `${NRK_API}/playback/manifest/${episodeId}`,
  ]
  for (const endpoint of endpoints) {
    const { status, body } = await fetchJson<PlaybackManifest>(endpoint, options)
    if (status === 200 && body?.playable?.assets?.[0]?.url) {
      return body.playable.assets[0].url
    }
  }
  return null
}

async function getSeasonEpisodeResources(
  seasons: { href: string }[],
): Promise<EpisodeHalResource[]> {
  const results: EpisodeHalResource[] = []
  for (const season of seasons) {
    const { status, body } = await fetchJson<SeasonEpisodes>(
      `https://psapi.nrk.no${season.href}`,
    )
    if (status !== 200 || !body) continue
    const episodes = body._embedded?.episodes?._embedded?.episodes ?? []
    results.push(...episodes)
  }
  return results
}

const EPISODES_PAGE_SIZE = 50
const VERBOSE = process.env.BACKFILL_VERBOSE === "1"

async function fetchAllEpisodes(
  seriesId: string,
  isPodcast: boolean,
): Promise<EpisodeHalResource[]> {
  const base = isPodcast
    ? `${NRK_API}/radio/catalog/podcast/${seriesId}/episodes`
    : `${NRK_API}/radio/catalog/series/${seriesId}/episodes`
  const all: EpisodeHalResource[] = []
  let url: string | null = `${base}?pageSize=${EPISODES_PAGE_SIZE}&page=1`

  while (url) {
    const res: { status: number; body: EpisodesResponse } =
      await fetchJson<EpisodesResponse>(url)
    if (res.status !== 200 || !res.body) break
    const body = res.body
    const episodes = body._embedded?.episodes ?? []
    all.push(...episodes)
    if (VERBOSE) console.log(`  ${seriesId}: catalog ${all.length} episodes`)
    if (body._links?.next?.href) {
      const nextHref = body._links.next.href
      url = nextHref.startsWith("http")
        ? nextHref
        : `https://psapi.nrk.no${nextHref}`
    } else if (episodes.length >= EPISODES_PAGE_SIZE) {
      const nextPage = all.length / EPISODES_PAGE_SIZE + 1
      url = `${base}?pageSize=${EPISODES_PAGE_SIZE}&page=${nextPage}`
    } else {
      url = null
    }
  }

  if (VERBOSE && all.length === 0)
    console.log(`  ${seriesId}: catalog returned 0 episodes`)
  return all
}

async function fetchEpisodesUntilKnown(
  seriesId: string,
  isPodcast: boolean,
  knownEpisodeIds: Set<string>,
): Promise<EpisodeHalResource[]> {
  const base = isPodcast
    ? `${NRK_API}/radio/catalog/podcast/${seriesId}/episodes`
    : `${NRK_API}/radio/catalog/series/${seriesId}/episodes`
  const collected: EpisodeHalResource[] = []
  let url: string | null = `${base}?pageSize=${EPISODES_PAGE_SIZE}&page=1`
  let reachedKnown = false

  while (url && !reachedKnown) {
    const res: { status: number; body: EpisodesResponse } =
      await fetchJson<EpisodesResponse>(url)
    if (res.status !== 200 || !res.body) break

    const body = res.body
    const episodes = body._embedded?.episodes ?? []
    for (const ep of episodes) {
      if (knownEpisodeIds.has(ep.episodeId)) {
        reachedKnown = true
        break
      }
      collected.push(ep)
    }

    if (VERBOSE) {
      console.log(`  ${seriesId}: incremental catalog ${collected.length} episodes`)
    }

    if (reachedKnown) break
    if (body._links?.next?.href) {
      const nextHref = body._links.next.href
      url = nextHref.startsWith("http")
        ? nextHref
        : `https://psapi.nrk.no${nextHref}`
    } else if (episodes.length >= EPISODES_PAGE_SIZE) {
      const nextPage = Math.floor(collected.length / EPISODES_PAGE_SIZE) + 2
      url = `${base}?pageSize=${EPISODES_PAGE_SIZE}&page=${nextPage}`
    } else {
      url = null
    }
  }

  return collected
}

async function resolveSeriesCatalog(
  seriesId: string,
): Promise<{ seriesBody: CatalogSeries; isPodcast: boolean } | null> {
  const [episodesRes, seriesRes] = await Promise.all([
    fetchJson<EpisodesResponse>(
      `${NRK_API}/radio/catalog/podcast/${seriesId}/episodes?pageSize=${EPISODES_PAGE_SIZE}`,
    ),
    fetchJson<CatalogSeries>(`${NRK_API}/radio/catalog/podcast/${seriesId}`),
  ])

  let episodeStatus = episodesRes.status
  let seriesStatus = seriesRes.status
  let seriesBody = seriesRes.body
  let isPodcast = true

  if (VERBOSE) {
    console.log(
      `  ${seriesId}: podcast catalog=${episodeStatus} series=${seriesStatus}`,
    )
  }

  if (episodeStatus !== 200 || seriesStatus !== 200) {
    if (VERBOSE) console.log(`  ${seriesId}: trying series endpoints...`)
    const [altEp, altSeries] = await Promise.all([
      fetchJson<EpisodesResponse>(
        `${NRK_API}/radio/catalog/series/${seriesId}/episodes?pageSize=${EPISODES_PAGE_SIZE}`,
      ),
      fetchJson<CatalogSeries>(`${NRK_API}/radio/catalog/series/${seriesId}`),
    ])
    episodeStatus = altEp.status
    seriesStatus = altSeries.status
    seriesBody = altSeries.body
    isPodcast = false
    if (VERBOSE)
      console.log(
        `  ${seriesId}: series catalog=${altEp.status} series=${altSeries.status}`,
      )
  }

  if (seriesStatus !== 200 || !seriesBody?.series) {
    if (VERBOSE)
      console.log(`  ${seriesId}: no series data (status=${seriesStatus})`)
    return null
  }

  if (VERBOSE)
    console.log(
      `  ${seriesId}: type=${seriesBody.type} seriesType=${seriesBody.seriesType}`,
    )

  return { seriesBody, isPodcast }
}

export async function getSeriesCatalog(
  seriesId: string,
): Promise<NrkSeriesCatalog | null> {
  const resolved = await resolveSeriesCatalog(seriesId)
  if (!resolved) return null
  const { seriesBody, isPodcast } = resolved

  const episodeResources =
    seriesBody.seriesType === "umbrella" && seriesBody._links?.seasons?.length
      ? await getSeasonEpisodeResources(seriesBody._links.seasons)
      : await fetchAllEpisodes(seriesId, isPodcast)

  return {
    series: seriesBody.series,
    type: seriesBody.type,
    episodeResources,
  }
}

export async function getSeriesCatalogUpdates(
  seriesId: string,
  knownEpisodeIds: Set<string>,
): Promise<NrkSeriesCatalog | null> {
  const resolved = await resolveSeriesCatalog(seriesId)
  if (!resolved) return null
  const { seriesBody, isPodcast } = resolved

  const episodeResources =
    seriesBody.seriesType === "umbrella" && seriesBody._links?.seasons?.length
      ? (await getSeasonEpisodeResources(seriesBody._links.seasons)).filter(
          (ep) => !knownEpisodeIds.has(ep.episodeId),
        )
      : await fetchEpisodesUntilKnown(seriesId, isPodcast, knownEpisodeIds)

  return {
    series: seriesBody.series,
    type: seriesBody.type,
    episodeResources,
  }
}

function toPlaybackEpisode(
  ep: EpisodeHalResource,
  url: string,
): PlaybackResolvedEpisode {
  return {
    url,
    id: ep.episodeId,
    titles: ep.titles,
    date: ep.date,
    durationInSeconds: ep.durationInSeconds,
    _links: ep._links,
  }
}

export async function fetchPlaybackUrlsBatch(
  episodeResources: EpisodeHalResource[],
  type: "series" | "podcast",
  options?: { delayPerRequest?: boolean },
): Promise<PlaybackResolvedEpisode[]> {
  const skipDelay = options?.delayPerRequest === false
  if (NRK_FETCH_DELAY_MS > 0 && !skipDelay) {
    const resolved: PlaybackResolvedEpisode[] = []
    for (const ep of episodeResources) {
      const url = await getPlaybackUrl(ep.episodeId, type, { skipDelay })
      if (url) resolved.push(toPlaybackEpisode(ep, url))
      else if (VERBOSE) console.warn(`  Skipped non-playable: ${ep.episodeId}`)
    }
    return resolved
  }

  const batch = await Promise.all(
    episodeResources.map(async (ep) => {
      const url = await getPlaybackUrl(ep.episodeId, type, { skipDelay })
      if (!url) return null
      return toPlaybackEpisode(ep, url)
    }),
  )
  const valid = batch.filter((ep): ep is NonNullable<typeof ep> => ep !== null)
  if (valid.length < batch.length && VERBOSE) {
    console.warn(`  Skipped ${batch.length - valid.length} non-playable in batch`)
  }
  return valid
}

async function getSeriesData(seriesId: string): Promise<{
  series: SeriesViewModel
  episodes: PlaybackResolvedEpisode[]
} | null> {
  const catalog = await getSeriesCatalog(seriesId)
  if (!catalog) return null

  const episodes: PlaybackResolvedEpisode[] = []
  const batchSize = NRK_FETCH_DELAY_MS > 0 ? 1 : 50
  for (let i = 0; i < catalog.episodeResources.length; i += batchSize) {
    const batch = catalog.episodeResources.slice(i, i + batchSize)
    const resolved = await fetchPlaybackUrlsBatch(batch, catalog.type)
    episodes.push(...resolved)
    if (VERBOSE)
      console.log(
        `  ${seriesId}: playback ${episodes.length}/${catalog.episodeResources.length}`,
      )
  }

  if (episodes.length === 0) {
    if (VERBOSE)
      console.log(
        `  ${seriesId}: 0 playable episodes (all skipped or none in catalog)`,
      )
    return null
  }

  return {
    series: catalog.series,
    episodes,
  }
}

export function parseSeries(data: {
  series: SeriesViewModel
  episodes: PlaybackResolvedEpisode[]
}): Series {
  const imageUrl = data.series.squareImage?.at(-1)?.url ?? ""
  return {
    id: data.series.id,
    title: data.series.titles.title,
    subtitle: data.series.titles.subtitle ?? null,
    link: `https://radio.nrk.no/podkast/${data.series.id}`,
    imageUrl,
    lastFetchedAt: new Date().toISOString(),
    episodes: data.episodes.map((ep) => ({
      id: ep.id,
      title: ep.titles.title,
      subtitle: ep.titles.subtitle ?? null,
      url: ep.url,
      shareLink: ep._links.share?.href ?? "",
      date: ep.date,
      durationInSeconds: ep.durationInSeconds,
    })),
  }
}

export async function getSeries(seriesId: string): Promise<Series | null> {
  const data = await getSeriesData(seriesId)
  if (!data) return null
  return parseSeries(data)
}

export type NrkPodcastEpisode = {
  indexPoints?: { title?: string; startPoint?: string }[]
}

export async function getEpisode(
  seriesId: string,
  episodeId: string,
): Promise<NrkPodcastEpisode | null> {
  const { status, body } = await fetchJson<NrkPodcastEpisode>(
    `${NRK_API}/radio/catalog/podcast/${seriesId}/episodes/${episodeId}`,
  )
  if (status !== 200) {
    const alt = await fetchJson<NrkPodcastEpisode>(
      `${NRK_API}/radio/catalog/series/${seriesId}/episodes/${episodeId}`,
    )
    if (alt.status !== 200 || !alt.body) return null
    return alt.body
  }
  return body
}
