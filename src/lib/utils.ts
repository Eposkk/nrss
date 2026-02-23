export function getHostUrl(): string {
	const configured = process.env.NEXT_PUBLIC_APP_URL
	if (configured && !configured.includes('localhost')) {
		return configured
	}
	if (process.env.VERCEL_URL) {
		return 'https://nrss.vercel.app'
	}
	if (process.env.NODE_ENV === 'production') {
		return 'https://nrss.vercel.app'
	}
	return 'http://localhost:3000'
}
