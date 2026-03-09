import Link from 'next/link'
import SearchWithResults from '@/components/SearchWithResults'
import { getHostUrl } from '@/lib/utils'

export default async function Home({
	searchParams,
}: {
	searchParams: Promise<{ query?: string }>
}) {
	const { query } = await searchParams
	const origin = getHostUrl()
	return (
		<div className='min-h-screen'>
			<main className='mx-auto max-w-3xl px-4 py-8 text-foreground'>
				<SearchWithResults initialQuery={query ?? null} origin={origin} />
				<article className='mt-12 pt-8 border-t border-border'>
					<h2 className='text-lg font-semibold text-foreground'>
						Hva er dette?
					</h2>
					<p className='mt-2 text-muted-foreground leading-relaxed'>
						Denne løsningen er en fork av olaven/nrss med noen tillegg:
					</p>
					<ul className='mt-2 text-muted-foreground leading-relaxed list-disc list-inside space-y-1'>
						<li>
							RSS-feeder mellomlagres, slik at vi ikke trenger å hente alt fra
							NRK API for hver forespørsel.
						</li>
						<li>
							Ved første innlasting av en serie henter vi episoder i bakgrunnen.
							Det kan derfor ta litt tid før hele feeden er klar.
						</li>
						<li>
							Når serien først er hentet, serveres feeden fra cache og går mye
							raskere.
						</li>
						<li>
							Hvis cachen er eldre enn 1 time, forsøker vi å hente nye episoder
							fra NRK API og oppdatere mellomlagringen.
						</li>
					</ul>
					<p className='mt-2 text-muted-foreground leading-relaxed'>
						Denne løsningen er laget som en reaksjon på at statsfinansierte NRK
						lukker ned innholdet sitt til sin egen app fremfor å bygge oppunder
						åpne standarder som RSS.
					</p>
					<h2 className='text-lg font-semibold text-foreground mt-6'>
						Hvordan bruker jeg dette?
					</h2>
					<p className='mt-2 text-muted-foreground leading-relaxed'>
						Søk på NRK-podcasten du vil høre på. Kopier deretter URL-en under
						bildet. Lim denne inn i akkurat den podcastspilleren du måtte
						foretrekke.
					</p>
					<h2 className='text-lg font-semibold text-foreground mt-6'>
						Kildekode
					</h2>
					<ul className='mt-2 text-muted-foreground leading-relaxed list-disc list-inside space-y-1'>
						<li>
							<Link
								href='https://github.com/olaven/nrss'
								target='_blank'
								rel='noreferrer'
								className='underline underline-offset-2 text-foreground hover:text-primary'
							>
								Original: olaven/nrss
							</Link>
						</li>
						<li>
							<Link
								href='https://github.com/Eposkk/nrss'
								target='_blank'
								rel='noreferrer'
								className='underline underline-offset-2 text-foreground hover:text-primary'
							>
								Denne versjonen: Eposkk/nrss
							</Link>
						</li>
					</ul>
				</article>
			</main>
		</div>
	)
}
