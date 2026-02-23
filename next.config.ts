import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
	images: {
		remotePatterns: [
			{ protocol: 'https', hostname: 'gfx.nrk.no', pathname: '/**' },
		],
	},
}

export default nextConfig
