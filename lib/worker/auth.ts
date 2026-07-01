import { NextResponse } from "next/server"

export function isWorkerAuthorized(request: Request) {
  const secret = process.env.WORKER_SECRET?.trim()
  if (!secret) return true

  const authorization = request.headers.get("authorization") ?? ""
  const workerHeader = request.headers.get("x-worker-secret") ?? ""
  return authorization === `Bearer ${secret}` || workerHeader === secret
}

export function workerUnauthorized() {
  return NextResponse.json(
    { error: "Unauthorized worker request" },
    { status: 401 }
  )
}

export function boundedNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}
