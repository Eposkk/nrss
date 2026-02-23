import Image from 'next/image'
import type { SearchSeriesResult } from '@/lib/nrk/types'
import CopyButton from './CopyButton'

export default function SeriesCard({
	serie,
	origin,
}: {
	serie: SearchSeriesResult
	origin: string
}) {
	const feedUrl = `${origin}/api/feeds/${serie.seriesId}`
	// We get the image in the middle of the list to hoepfully get one of decent quality
	const image = serie.images?.[Math.floor(serie.images.length / 2)]
	const description = (serie.description ?? serie.subtitle ?? '').trim()

	return (
		<article className='rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 shadow-sm overflow-hidden hover:shadow-md transition-shadow'>
			<div className='p-5 flex gap-4 flex-col sm:flex-row'>
				{image?.uri ? (
					<div className='shrink-0'>
						<Image
							src={image.uri}
							width={Math.round((image.width ?? 160) * 0.75)}
							height={Math.round((image.width ?? 160) * 0.75)}
							alt=''
							className='rounded-lg object-cover max-w-60'
						/>
					</div>
				) : null}
				<div className='min-w-0 flex-1 flex flex-col gap-3'>
					<h3 className='text-lg font-semibold text-slate-900 dark:text-slate-100 leading-tight line-clamp-2'>
						{serie.title}
					</h3>
					{description ? (
						<p className='text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3'>
							{description}
						</p>
					) : null}
					<div className='mt-auto flex gap-2 items-stretch'>
						<input
							type='text'
							readOnly
							value={feedUrl}
							className='flex-1 min-w-0 font-mono text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700'
							aria-label='RSS feed URL'
						/>
						<CopyButton
							copyText={feedUrl}
							className='shrink-0 px-3 py-2 text-sm rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors'
						>
							Kopier URL
						</CopyButton>
					</div>
				</div>
			</div>
		</article>
	)
}
