import { NextResponse } from "next/server"

import { getCurrentSession, requireCurrentUser } from "@/lib/auth/session"
import {
  getUserAccountProfile,
  listAuthSessions,
  listAuthWallets,
} from "@/lib/auth/store"

export const runtime = "nodejs"

export async function GET() {
  try {
    const [user, current] = await Promise.all([requireCurrentUser(), getCurrentSession()])
    const [profile, sessions, wallets] = await Promise.all([
      getUserAccountProfile(user.id),
      listAuthSessions(user.id, current?.sessionId),
      listAuthWallets(user.id),
    ])
    return NextResponse.json({ profile, sessions, wallets })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
