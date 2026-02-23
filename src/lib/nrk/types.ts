export type SearchSeriesResult = {
	id: string
	seriesId: string
	type: 'series' | 'podcast' | 'customSeason'
	title: string
	subtitle?: string | null
	description?: string | null
	numberOfEpisodes?: number
	episodeCount?: number
	images: { uri?: string; width?: number }[]
}

export type SearchResponse = {
	results: {
		series?: { results?: SearchSeriesResult[] }
	}
}
