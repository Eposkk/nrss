export type Episode = {
	id: string
	title: string
	subtitle: string | null
	url: string
	shareLink: string
	date: string
	durationInSeconds: number
}

export type Series = {
	id: string
	title: string
	subtitle: string | null
	link: string
	imageUrl: string
	lastFetchedAt: string
	episodes: Episode[]
}
