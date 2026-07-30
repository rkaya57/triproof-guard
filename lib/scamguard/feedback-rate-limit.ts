const windows = new Map<string, { used: number; resetAt: number }>()

export function scamGuardFeedbackRateLimit(identifier: string) {
  const now = Date.now()
  const key = identifier || "anonymous"
  const current = windows.get(key)
  if (!current || current.resetAt <= now) {
    windows.set(key, { used: 1, resetAt: now + 60 * 60 * 1000 })
    return { allowed: true, retryAfterSeconds: 0 }
  }
  if (current.used >= 12) return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) }
  current.used += 1
  return { allowed: true, retryAfterSeconds: 0 }
}
