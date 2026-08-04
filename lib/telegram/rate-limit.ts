type Bucket = { timestamps: number[] }

const buckets = new Map<string, Bucket>()
const WINDOW_MS = 60_000

export function consumeTelegramScanAllowance(input: { chatId: number; userId?: number; group: boolean }) {
  const limit = input.group ? 24 : 10
  const key = input.group ? `group:${input.chatId}` : `user:${input.userId ?? input.chatId}`
  const now = Date.now()
  const bucket = buckets.get(key) ?? { timestamps: [] }
  bucket.timestamps = bucket.timestamps.filter((timestamp) => timestamp > now - WINDOW_MS)
  if (bucket.timestamps.length >= limit) {
    buckets.set(key, bucket)
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.timestamps[0] + WINDOW_MS - now) / 1000)) }
  }
  bucket.timestamps.push(now)
  buckets.set(key, bucket)
  return { allowed: true, retryAfterSeconds: 0 }
}
