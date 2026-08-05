import { NextResponse } from "next/server"

import { getCurrentSession, requireCurrentUser } from "@/lib/auth/session"
import { listAuthSessions } from "@/lib/auth/store"

export const runtime = "nodejs"

export async function GET() {
  try {
    const [user, current] = await Promise.all([requireCurrentUser(), getCurrentSession()])
    const sessions = await listAuthSessions(user.id, current?.sessionId)
    return NextResponse.json({ sessions })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
