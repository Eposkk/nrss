'use client'

import { Moon, Sparkles, Sun } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useBackground } from '@/contexts/background-context'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

function ThemeToggle() {
	const { setTheme, resolvedTheme } = useTheme()
	const isDark = resolvedTheme === 'dark'

	return (
		<Button
			type='button'
			variant='ghost'
			size='icon-sm'
			onClick={() => setTheme(isDark ? 'light' : 'dark')}
			aria-label={isDark ? 'Bytt til lys modus' : 'Bytt til mørk modus'}
			className='relative overflow-hidden'
		>
			<Sun className='size-4 rotate-0 scale-100 transition-all duration-300 dark:-rotate-90 dark:scale-0' />
			<Moon className='absolute size-4 rotate-90 scale-0 transition-all duration-300 dark:rotate-0 dark:scale-100' />
		</Button>
	)
}

function BackgroundToggle() {
	const { enabled, toggle } = useBackground()

	return (
		<Button
			type='button'
			variant='ghost'
			size='icon-sm'
			onClick={toggle}
			aria-label={enabled ? 'Skru av bakgrunn' : 'Skru på bakgrunn'}
			className={cn(!enabled && 'opacity-60')}
		>
			<Sparkles className='size-4' />
		</Button>
	)
}

const PAGE_CONFIG: Record<
	string,
	{ title: string; subtitle: string; href?: string }
> = {
	'/': {
		title: 'NRSS',
		subtitle: 'NRK podcast RSS-feeds - fork av olaven/nrss',
		href: '/',
	},
	'/admin/queue': {
		title: 'NRSS Admin',
		subtitle: 'Queue status (refresh every 10s)',
		href: '/',
	},
}

export default function Header() {
	const pathname = usePathname()
	const config =
		PAGE_CONFIG[pathname] ?? PAGE_CONFIG[pathname?.startsWith('/admin') ? '/admin/queue' : '/']

	return (
		<header className='border-b border-border bg-background/90 backdrop-blur sticky top-0 z-10 transition-colors duration-300'>
			<div className='mx-auto max-w-3xl px-4 py-6 flex items-start justify-between gap-4'>
				<Link href={config.href ?? '/'} className='inline-block shrink-0'>
					<h1 className='text-2xl font-bold text-foreground tracking-tight hover:opacity-80 transition-opacity'>
						{config.title}
					</h1>
					<p className='text-muted-foreground text-sm mt-0.5'>
						{config.subtitle}
					</p>
				</Link>
				<div className='flex items-center gap-1 shrink-0'>
					<ThemeToggle />
					<BackgroundToggle />
				</div>
			</div>
		</header>
	)
}
