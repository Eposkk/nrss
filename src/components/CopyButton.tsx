'use client'

import { useCallback, useState } from 'react'
import { Button } from './ui/button'

export default function CopyButton({
	copyText,
	children,
	className,
}: {
	copyText: string
	children: React.ReactNode
	className?: string
}) {
	const [copied, setCopied] = useState(false)

	const handleClick = useCallback(async () => {
		await navigator.clipboard.writeText(copyText)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}, [copyText])

	return (
		<Button
			type='button'
			variant='secondary'
			size='lg'
			onClick={handleClick}
			className={className}
		>
			{copied ? 'Kopiert ✓' : children}
		</Button>
	)
}
