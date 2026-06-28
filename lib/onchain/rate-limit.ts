/**
 * Batching + delay + exponential-backoff retry helpers for on-chain providers.
 *
 * These keep us within third-party API rate limits and isolate transient
 * failures so a single flaky wallet never crashes a whole analysis.
 */

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items]
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }
  return batches
}

export class RateLimitError extends Error {
  constructor(message = "Provider rate limit reached") {
    super(message)
    this.name = "RateLimitError"
  }
}

export type RetryOptions = {
  maxRetries?: number
  baseDelayMs?: number
  onRetry?: (attempt: number, error: unknown) => void
}

/**
 * Run `task` with exponential backoff. Retries up to `maxRetries` times,
 * doubling the delay each attempt (250ms -> 500ms -> 1000ms by default).
 */
export async function withRetry<T>(
  task: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3
  const baseDelayMs = options.baseDelayMs ?? 250

  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      if (attempt === maxRetries) break
      options.onRetry?.(attempt + 1, error)
      await sleep(baseDelayMs * 2 ** attempt)
    }
  }

  throw lastError
}
