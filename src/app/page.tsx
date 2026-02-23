import SearchWithResults from "@/components/SearchWithResults"
import { getHostUrl } from "@/lib/utils"

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ query?: string }>
}) {
  const { query } = await searchParams
  const origin = getHostUrl()
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <h1 className="text-2xl font-bold tracking-tight">NRSS</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-0.5">
            NRK podcast RSS-feeds - fork av olaven/nrss
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <SearchWithResults initialQuery={query ?? null} origin={origin} />
        <article className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            Hva er dette?
          </h2>
          <p className="mt-2 text-slate-600 dark:text-slate-400 leading-relaxed">
            Denne løsningen er en fork av olaven/nrss med noen tillegg:
          </p>
          <ul className="mt-2 text-slate-600 dark:text-slate-400 leading-relaxed list-disc list-inside space-y-1">
            <li>
              RSS-feeder lagres i Redis, slik at vi ikke trenger å hente alt fra
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
          <p className="mt-2 text-slate-600 dark:text-slate-400 leading-relaxed">
            Denne løsningen er laget som en reaksjon på at statsfinansierte NRK
            lukker ned innholdet sitt til sin egen app fremfor å bygge oppunder
            åpne standarder som RSS.
          </p>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mt-6">
            Hvordan bruker jeg dette?
          </h2>
          <p className="mt-2 text-slate-600 dark:text-slate-400 leading-relaxed">
            Søk på NRK-podcasten du vil høre på. Kopier deretter URL-en under
            bildet. Lim denne inn i akkurat den podcastspilleren du måtte
            foretrekke.
          </p>
        </article>
      </main>
    </div>
  )
}
