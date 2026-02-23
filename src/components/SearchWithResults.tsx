'use client'

import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import SeriesCard from './SeriesCard'
import type { SearchSeriesResult } from '@/lib/nrk/types'

const DEBOUNCE_MS = 400

async function fetchSearch(q: string): Promise<SearchSeriesResult[]> {
	const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
	const json = await res.json()
	return json.results ?? []
}

function Spinner() {
	return (
		<div className='mt-8 flex justify-center' role='status' aria-label='Søker'>
			<svg
				className='animate-spin h-8 w-8 text-slate-400'
				xmlns='http://www.w3.org/2000/svg'
				fill='none'
				viewBox='0 0 24 24'
			>
				<circle
					className='opacity-25'
					cx='12'
					cy='12'
					r='10'
					stroke='currentColor'
					strokeWidth='4'
				/>
				<path
					className='opacity-75'
					fill='currentColor'
					d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
				/>
			</svg>
		</div>
	)
}

export default function SearchWithResults({
	initialQuery,
	origin,
}: {
	initialQuery: string | null
	origin: string
}) {
	const [value, setValue] = useState(initialQuery ?? '')
	const [query, setQuery] = useState(initialQuery?.trim() ?? '')

	useEffect(() => {
		const trimmed = value.trim()
		if (trimmed === query) return
		const id = setTimeout(() => {
			setQuery(trimmed)
			const params = new URLSearchParams()
			if (trimmed) params.set('query', trimmed)
			const url = params.toString() ? `/?${params}` : '/'
			window.history.replaceState(null, '', url)
		}, DEBOUNCE_MS)
		return () => clearTimeout(id)
	}, [value, query])

	const {
		data: results,
		isLoading,
		isFetching,
	} = useQuery({
		queryKey: ['search', query],
		queryFn: () => fetchSearch(query),
		enabled: query.length > 0,
		staleTime: 60_000,
	})

	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault()
			const next = value.trim()
			setQuery(next)
			const params = new URLSearchParams()
			if (next) params.set('query', next)
			window.history.replaceState(
				null,
				'',
				params.toString() ? `/?${params}` : '/'
			)
		},
		[value]
	)

	const showSpinner = isLoading || (isFetching && (results?.length ?? 0) > 0)

	return (
		<>
			<form onSubmit={handleSubmit} className='flex gap-3 flex-col sm:flex-row'>
				<label className='sr-only' htmlFor='query'>
					Program
				</label>
				<input
					type='search'
					placeholder='Søk på NRK-podcast...'
					name='query'
					id='query'
					value={value}
					onChange={(e) => setValue(e.target.value)}
					className='flex-1 px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-shadow'
				/>
				<button
					type='submit'
					className='px-6 py-3 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors shrink-0'
				>
					Søk
				</button>
			</form>

			{showSpinner && <Spinner />}

			{query && !showSpinner && results !== undefined && (
				<div className='mt-8'>
					{results.length === 0 ? (
						<p className='text-slate-600 dark:text-slate-400 text-center py-12'>
							Ingen resultater for dette søket.
						</p>
					) : (
						<>
							<p className='text-sm text-slate-500 dark:text-slate-400 mb-4'>
								{results.length} treff
							</p>
							<div className='space-y-4'>
								{results.map((serie, i) => (
									<SeriesCard
										key={`${serie.seriesId}-${serie.id}-${i}`}
										serie={serie}
										origin={origin}
									/>
								))}
							</div>
						</>
					)}
				</div>
			)}
		</>
	)
}
