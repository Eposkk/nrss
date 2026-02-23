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
	const image = serie.images?.[0]

	return (
		<article className='rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 shadow-sm overflow-hidden hover:shadow-md transition-shadow'>
			<div className='p-5 flex gap-4 flex-col sm:flex-row'>
				{image?.uri ? (
					<div className='shrink-0'>
						<Image
							src={image.uri}
							width={image.width ?? 160}
							height={Math.round((image.width ?? 160) * 0.75)}
							alt=''
							className='rounded-lg object-cover'
						/>
					</div>
				) : null}
				<div className='min-w-0 flex-1 flex flex-col gap-3'>
					<h3 className='text-lg font-semibold text-slate-900 dark:text-slate-100 leading-tight'>
						{serie.title}
					</h3>
					<div className='flex flex-wrap gap-2'>
						<CopyButton
							copyText={feedUrl}
							className='shrink-0 px-3 py-1.5 text-sm rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors'
						>
							Kopier URL
						</CopyButton>
					</div>
					<pre className='mt-auto font-mono text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 overflow-x-auto select-all break-all'>
						{feedUrl}
					</pre>
				</div>
			</div>
		</article>
	)
}
