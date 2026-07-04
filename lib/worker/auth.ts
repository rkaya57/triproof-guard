import { NextResponse } from "next/server"

import {
  requireAnyConfiguredSecret,
  requiredProductionSecretGroups,
} from "@/lib/env/validation"

function configuredWorkerSecrets() {
  return requireAnyConfiguredSecret(requiredProductionSecretGroups.worker, {
    allowInsecureDevMissing: true,
  })
}

export function isWorkerAuthorized(request: Request) {
  const secrets = configuredWorkerSecrets()
  if (!secrets.length) return true

  const authorization = request.headers.get("authorization") ?? ""
  const bearer = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : ""
  const workerHeader = request.headers.get("x-worker-secret") ?? ""

  return secrets.some((secret) => bearer === secret || workerHeader === secret)
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
