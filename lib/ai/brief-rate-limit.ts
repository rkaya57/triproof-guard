type RateWindow = {
  count: number
  resetAt: number
}

const windows = new Map<string, RateWindow>()
const windowMs = 60_000
const requestLimit = 6

export function aiBriefRateLimit(identifier: string) {
  const now = Date.now()
  const key = identifier.trim() || "anonymous"
  const current = windows.get(key)
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: requestLimit - 1, retryAfterSeconds: 0 }
  }

  current.count += 1
  if (windows.size > 5_000) {
    for (const [windowKey, value] of windows) {
      if (value.resetAt <= now) windows.delete(windowKey)
    }
  }
  return {
    allowed: current.count <= requestLimit,
    remaining: Math.max(0, requestLimit - current.count),
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
  }
}
