import { NextResponse } from "next/server"

import { humanGuardOriginAllowed, normalizeHumanGuardOrigin } from "@/lib/humanguard/core"

export function humanGuardCorsHeaders(origin?: string | null) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  }
  if (origin) headers["Access-Control-Allow-Origin"] = origin
  return headers
}

export function humanGuardPreflight(request: Request) {
  const rawOrigin = request.headers.get("origin")
  let origin: string | null = null
  try {
    origin = rawOrigin ? normalizeHumanGuardOrigin(rawOrigin) : null
  } catch {
    origin = null
  }
  return new Response(null, { status: 204, headers: humanGuardCorsHeaders(origin) })
}

export function humanGuardPublicJson(body: unknown, status: number, origin?: string | null) {
  return NextResponse.json(body, {
    status,
    headers: humanGuardCorsHeaders(origin),
  })
}

export function requireAllowedHumanGuardOrigin(request: Request, allowedOrigins: unknown) {
  const rawOrigin = request.headers.get("origin")
  if (!rawOrigin) return { ok: false as const, origin: null, error: "Origin header is required" }

  let origin: string
  try {
    origin = normalizeHumanGuardOrigin(rawOrigin)
  } catch {
    return { ok: false as const, origin: null, error: "Invalid Origin header" }
  }

  if (!humanGuardOriginAllowed(origin, allowedOrigins)) {
    return { ok: false as const, origin, error: "Origin is not allowed for this HumanGuard site" }
  }

  return { ok: true as const, origin, error: null }
}
