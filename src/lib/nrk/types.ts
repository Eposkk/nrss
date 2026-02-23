export type SearchSeriesResult = {
	id: string
	seriesId: string
	type: 'series' | 'podcast' | 'customSeason'
	title: string
	images: { uri?: string; width?: number }[]
}

export type SearchResponse = {
	results: {
		series?: { results?: SearchSeriesResult[] }
	}
}
