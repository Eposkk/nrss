import type { Metadata } from 'next'
import { Geist, Geist_Mono, Inter } from 'next/font/google'
import Providers from './providers'
import './globals.css'
import { Analytics } from '@vercel/analytics/next'
import { cn } from '@/lib/utils'
import { LayoutContent } from './layout-content'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin'],
})

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin'],
})

export const metadata: Metadata = {
	title: 'NRSS',
	description: 'NRK podcast RSS feeds',
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang='nb' suppressHydrationWarning className={cn('font-sans', inter.variable)}>
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased relative transition-colors duration-300`}
			>
				<Providers>
					<LayoutContent>{children}</LayoutContent>
				</Providers>
				<Analytics />
			</body>
		</html>
	)
}
