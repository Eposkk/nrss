'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Button } from '@/components/ui/button'

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
			<main className='mx-auto max-w-3xl px-4 py-8 text-foreground'>
				{(error || unblockMutation.error) && (
					<p className='text-destructive mb-4'>
						{error?.message ?? unblockMutation.error?.message}
					</p>
				)}
				{status ? (
					<div className='space-y-6'>
						<section>
							<h2 className='text-lg font-semibold text-foreground'>
								Active
							</h2>
							{status.active ? (
								<div className='mt-1 space-y-1 text-muted-foreground'>
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
								<p className='mt-1 text-muted-foreground'>None</p>
							)}
						</section>
						<section>
							<h2 className='text-lg font-semibold text-foreground'>
								Queued ({status.queued.length} items)
							</h2>
							{status.queued.length > 0 ? (
								<ul className='mt-2 list-decimal list-inside space-y-1 text-muted-foreground'>
									{status.queued.map((q, i) => (
										<li key={`${q.seriesId}-${i}`}>
											{q.seriesId} (enqueued{' '}
											{new Date(q.enqueuedAt).toISOString()})
										</li>
									))}
								</ul>
							) : (
								<p className='mt-1 text-muted-foreground'>Empty</p>
							)}
						</section>
						<section>
							<h2 className='text-lg font-semibold text-foreground'>
								Kick lock
							</h2>
							<p className='mt-1 text-muted-foreground'>
								{status.kickLocked ? (
									<span className='text-foreground font-medium'>Held</span>
								) : (
									<span>Not held</span>
								)}
							</p>
						</section>
						<Button
							type='button'
							variant='secondary'
							size='form-sm'
							onClick={handleUnblock}
							disabled={!canUnblock || unblockMutation.isPending}
						>
							{unblockMutation.isPending ? 'Unblocking…' : 'Unblock queue'}
						</Button>
					</div>
				) : isPending ? (
					<p className='text-muted-foreground'>Loading…</p>
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
