import { Fingerprint, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react"
import { redirect } from "next/navigation"

import {
  AccountSecurity,
  type AccountSecurityData,
} from "@/components/auth/account-security"
import { ChangePasswordCard } from "@/components/auth/change-password-card"
import { Badge } from "@/components/ui/badge"
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

  return (
    <div className="grid gap-5">
      <section className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-[linear-gradient(120deg,rgba(6,78,59,.22),rgba(15,23,42,.88)_58%,rgba(8,47,73,.18))] p-6 sm:p-7">
        <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <Badge variant="outline" className="mb-3 border-emerald-400/25 bg-emerald-400/[0.05] text-emerald-200"><LockKeyhole className="mr-1 size-3" /> Account security</Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Sessions, wallets and credentials</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Review active devices, revoke sessions, manage linked wallets and rotate your password from one security-focused workspace.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-300">
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2"><Fingerprint className="size-3.5 text-emerald-300" /> {sessions.length} sessions</span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2"><KeyRound className="size-3.5 text-cyan-300" /> {wallets.length} linked wallets</span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2"><ShieldCheck className="size-3.5 text-emerald-300" /> Protected</span>
          </div>
        </div>
      </section>
      <AccountSecurity initialData={initialData} />
      <ChangePasswordCard />
    </div>
  )
}
