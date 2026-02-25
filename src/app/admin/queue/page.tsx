'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

type QueueStatus = {
	active: { seriesId: string; claimedAt: string } | null
	activeProgress: {
		completedBatches: number
		totalBatches: number
		completedEpisodes: number
		totalEpisodes: number
		status: string
	} | null
	queued: { seriesId: string; enqueuedAt: number }[]
	kickLocked: boolean
}

async function fetchQueueStatus(secret: string | null): Promise<QueueStatus> {
	const url = secret
		? `/api/admin/queue?secret=${encodeURIComponent(secret)}`
		: '/api/admin/queue'
	const res = await fetch(url)
	if (!res.ok) {
		if (res.status === 401) throw new Error('Unauthorized')
		throw new Error(`Error ${res.status}`)
	}
	return res.json() as Promise<QueueStatus>
}

async function unblockQueue(secret: string | null): Promise<void> {
	const url = secret
		? `/api/admin/queue?secret=${encodeURIComponent(secret)}`
		: '/api/admin/queue'
	const res = await fetch(url, { method: 'POST' })
	if (!res.ok) {
		if (res.status === 401) throw new Error('Unauthorized')
		throw new Error(`Error ${res.status}`)
	}
}

function AdminQueueContent() {
	const searchParams = useSearchParams()
	const secret = searchParams.get('secret')
	const queryClient = useQueryClient()

	const {
		data: status,
		error,
		isPending,
	} = useQuery({
		queryKey: ['admin', 'queue', secret],
		queryFn: () => fetchQueueStatus(secret),
		refetchInterval: 10_000,
	})

	const unblockMutation = useMutation({
		mutationFn: () => unblockQueue(secret),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['admin', 'queue', secret] })
		},
	})

	const handleUnblock = () => unblockMutation.mutate()

	const canUnblock =
		status != null && (status.active != null || status.kickLocked)

	return (
		<div className='min-h-screen'>
			<header className='border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-10'>
				<div className='mx-auto max-w-3xl px-4 py-6'>
					<Link href='/' className='inline-block'>
						<h1 className='text-2xl font-bold tracking-tight hover:opacity-80 transition-opacity'>
							NRSS Admin
						</h1>
						<p className='text-slate-600 dark:text-slate-400 text-sm mt-0.5'>
							Queue status (refresh every 10s)
						</p>
					</Link>
				</div>
			</header>
			<main className='mx-auto max-w-3xl px-4 py-8'>
				{(error || unblockMutation.error) && (
					<p className='text-red-600 dark:text-red-400 mb-4'>
						{error?.message ?? unblockMutation.error?.message}
					</p>
				)}
				{status ? (
					<div className='space-y-6'>
						<section>
							<h2 className='text-lg font-semibold text-slate-800 dark:text-slate-200'>
								Active
							</h2>
							{status.active ? (
								<div className='mt-1 space-y-1 text-slate-600 dark:text-slate-400'>
									<p>
										{status.active.seriesId} (claimed at{' '}
										{new Date(status.active.claimedAt).toISOString()})
									</p>
									{status.activeProgress &&
										status.activeProgress.totalBatches > 0 && (
											<p className='text-sm'>
												Batch {status.activeProgress.completedBatches}/
												{status.activeProgress.totalBatches} · Episodes{' '}
												{status.activeProgress.completedEpisodes}/
												{status.activeProgress.totalEpisodes} (
												{status.activeProgress.status})
											</p>
										)}
								</div>
							) : (
								<p className='mt-1 text-slate-500'>None</p>
							)}
						</section>
						<section>
							<h2 className='text-lg font-semibold text-slate-800 dark:text-slate-200'>
								Queued ({status.queued.length} items)
							</h2>
							{status.queued.length > 0 ? (
								<ul className='mt-2 list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-400'>
									{status.queued.map((q, i) => (
										<li key={`${q.seriesId}-${i}`}>
											{q.seriesId} (enqueued{' '}
											{new Date(q.enqueuedAt).toISOString()})
										</li>
									))}
								</ul>
							) : (
								<p className='mt-1 text-slate-500'>Empty</p>
							)}
						</section>
						<section>
							<h2 className='text-lg font-semibold text-slate-800 dark:text-slate-200'>
								Kick lock
							</h2>
							<p className='mt-1 text-slate-600 dark:text-slate-400'>
								{status.kickLocked ? (
									<span className='text-amber-600 dark:text-amber-400'>
										Held
									</span>
								) : (
									<span className='text-slate-500'>Not held</span>
								)}
							</p>
						</section>
						<button
							type='button'
							onClick={handleUnblock}
							disabled={!canUnblock || unblockMutation.isPending}
							className='rounded-lg bg-slate-200 dark:bg-slate-700 px-4 py-2 text-slate-800 dark:text-slate-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors'
						>
							{unblockMutation.isPending ? 'Unblocking…' : 'Unblock queue'}
						</button>
					</div>
				) : isPending ? (
					<p className='text-slate-500'>Loading…</p>
				) : null}
			</main>
		</div>
	)
}

export default function AdminQueuePage() {
	return (
		<Suspense
			fallback={
				<div className='min-h-screen flex items-center justify-center'>
					Loading…
				</div>
			}
		>
			<AdminQueueContent />
		</Suspense>
	)
}
