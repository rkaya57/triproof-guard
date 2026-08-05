import { redirect } from "next/navigation"

import {
  AccountSecurity,
  type AccountSecurityData,
} from "@/components/auth/account-security"
import { getCurrentSession } from "@/lib/auth/session"
import {
  findAuthUserById,
  getUserAccountProfile,
  listAuthSessions,
  listAuthWallets,
} from "@/lib/auth/store"

export default async function Page() {
  const session = await getCurrentSession()
  if (!session) redirect("/login?next=%2Fdashboard%2Fsettings%2Fsecurity")

  const user = await findAuthUserById(session.userId)
  if (!user) redirect("/login?next=%2Fdashboard%2Fsettings%2Fsecurity")

  const [profile, sessions, wallets] = await Promise.all([
    getUserAccountProfile(user.id),
    listAuthSessions(user.id, session.sessionId),
    listAuthWallets(user.id),
  ])

  const initialData: AccountSecurityData = {
    profile: profile
      ? {
          email: profile.email,
          emailVerifiedAt: profile.emailVerifiedAt?.toISOString() ?? null,
          referralCode: profile.referralCode,
        }
      : null,
    sessions: sessions.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      lastSeenAt: item.lastSeenAt.toISOString(),
      expiresAt: item.expiresAt.toISOString(),
    })),
    wallets: wallets.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      lastUsedAt: item.lastUsedAt?.toISOString() ?? null,
    })),
  }

  return <AccountSecurity initialData={initialData} />
}
