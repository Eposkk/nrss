'use client'

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from 'react'

const STORAGE_KEY = 'nrss-bg-animation'

type BackgroundContextValue = {
	enabled: boolean
	toggle: () => void
}

const BackgroundContext = createContext<BackgroundContextValue | null>(null)

export function BackgroundProvider({ children }: { children: React.ReactNode }) {
	const [enabled, setEnabled] = useState(false)
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
		const stored = localStorage.getItem(STORAGE_KEY)
		if (stored !== null) setEnabled(stored === 'true')
	}, [])

	useEffect(() => {
		if (!mounted) return
		localStorage.setItem(STORAGE_KEY, String(enabled))
	}, [enabled, mounted])

	const toggle = useCallback(() => setEnabled((v) => !v), [])

	return (
		<BackgroundContext.Provider value={{ enabled, toggle }}>
			{children}
		</BackgroundContext.Provider>
	)
}

export function useBackground() {
	const ctx = useContext(BackgroundContext)
	if (!ctx) throw new Error('useBackground must be used within BackgroundProvider')
	return ctx
}
