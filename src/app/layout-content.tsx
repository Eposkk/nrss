'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { StarfieldBackground } from './starfield-bg'
import { useBackground } from '@/contexts/background-context'
import Header from '@/components/Header'

export function LayoutContent({
	children,
}: {
	children: React.ReactNode
}) {
	const { enabled } = useBackground()

	return (
		<>
			<AnimatePresence mode='wait'>
				{enabled && (
					<motion.div
						key='starfield'
						initial={{ opacity: 0 }}
						animate={{ opacity: 0.8 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.3 }}
						className='fixed inset-0 z-0 overflow-hidden pointer-events-none'
					>
						<StarfieldBackground className='h-full w-full' />
					</motion.div>
				)}
			</AnimatePresence>
			<div className='relative z-10'>
				<Header />
				{children}
			</div>
		</>
	)
}
