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
		<article className='rounded-xl border border-border bg-card/90 shadow-sm overflow-hidden hover:shadow-md transition-shadow'>
			<div className='p-5 flex gap-4 flex-col sm:flex-row'>
				{image?.uri ? (
					<div className='shrink-0'>
						<Image
							src={image.uri}
							width={0}
							height={0}
							sizes='100vw'
							style={{ width: '100%', height: 'auto' }} // optional
							alt=''
							className='rounded-lg object-cover max-w-50'
						/>
					</div>
				) : null}
				<div className='min-w-0 flex-1 flex flex-col gap-3'>
					<h3 className='text-lg font-semibold text-foreground leading-tight line-clamp-2'>
						{serie.title}
					</h3>
					{description ? (
						<p className='text-sm text-muted-foreground leading-relaxed line-clamp-3'>
							{description}
						</p>
					) : null}
					<div className='mt-auto flex gap-2 items-stretch'>
						<input
							type='text'
							readOnly
							value={feedUrl}
							className='flex-1 min-w-0 font-mono text-xs text-foreground bg-muted/50 rounded-lg px-3 py-2 border border-border'
							aria-label='RSS feed URL'
						/>
						<CopyButton copyText={feedUrl} className='shrink-0'>
							Kopier URL
						</CopyButton>
					</div>
				</div>
			</div>
		</article>
	)
}
