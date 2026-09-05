export type QueueSnapshot = {
  pending: number
  processing: number
  staleProcessing?: number
}

export function needsContinuation(queue: QueueSnapshot | null | undefined, workerLockAcquired = true) {
  if (!queue || !workerLockAcquired) return false
  return (queue.staleProcessing ?? 0) > 0 || (queue.pending > 0 && queue.processing === 0)
}

export function continuationUrl(origin: string, analysisId: string | null) {
  const url = new URL("/api/worker/analysis-queue", origin)
  if (analysisId) url.searchParams.set("analysisId", analysisId)
  // Acknowledge first, then work in the new invocation's own time budget.
  url.searchParams.set("defer", "true")
  return url
}
