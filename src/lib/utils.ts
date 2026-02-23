export function getHostUrl(): string {
	if (process.env.VERCEL_URL) {
		return `https://nrss.vercel.app`
	}
	return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}
