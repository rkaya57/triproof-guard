import Link from "next/link"
import { CalendarDays, ChevronLeft, Mail, ShieldCheck, UsersRound } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminUser, isAdminEmail } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"

function planLabel(value: string | null | undefined) {
  return (value ?? "FREE").replaceAll("_", " ")
}

function planTone(value: string | null | undefined) {
  if (value === "API_GROWTH" || value === "COMMUNITY") return "border-primary/35 bg-primary/10 text-primary"
  if (value === "BUILDER" || value === "API_STARTER") return "border-green-400/35 bg-green-400/10 text-green-100"
  return "border-border text-muted-foreground"
}

export default async function UsersAdminPage() {
  const admin = await getAdminUser()
  if (!admin) return <Card className="glass-panel"><CardHeader><CardTitle>Admin access required</CardTitle><CardDescription>Only approved Tri-Proof admins can view the user directory.</CardDescription></CardHeader><CardContent><Link href="/dashboard" className={buttonVariants()}>Back to dashboard</Link></CardContent></Card>

  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      subscription: { select: { plan: true, status: true, expiresAt: true } },
      _count: { select: { projects: true, apiKeys: true, ownedTelegramGroups: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  })
  const adminCount = users.filter((user) => isAdminEmail(user.email)).length
  const paidCount = users.filter((user) => user.subscription?.plan && user.subscription.plan !== "FREE" && user.subscription.status === "ACTIVE").length

  return <div className="grid gap-7">
    <section className="dashboard-hero rounded-2xl p-6 sm:p-8">
      <Badge variant="secondary" className="mb-4 border-primary/30 bg-primary/10 text-primary"><UsersRound /> Restricted user directory</Badge>
      <h2 className="text-gradient text-3xl font-semibold sm:text-4xl">Accounts and access overview</h2>
      <p className="mt-3 max-w-3xl text-muted-foreground">Admin-only view of registered names, emails, subscription status, and product footprint. Passwords, API keys, wallet secrets, and payment details are never shown here.</p>
    </section>

    <section className="grid gap-4 sm:grid-cols-3">
      <Metric icon={UsersRound} label="Registered users" value={users.length} />
      <Metric icon={ShieldCheck} label="Admin accounts" value={adminCount} />
      <Metric icon={CalendarDays} label="Active paid plans" value={paidCount} />
    </section>

    <Card className="glass-panel premium-card overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-4"><div><CardTitle>User directory</CardTitle><CardDescription>Newest accounts first. Up to 500 accounts are shown.</CardDescription></div><Link href="/dashboard/admin" className={buttonVariants({ variant: "outline", size: "sm" })}><ChevronLeft /> Admin center</Link></CardHeader>
      <CardContent className="overflow-x-auto px-0 pb-0">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-y border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-6 py-3">User</th><th className="px-6 py-3">Access</th><th className="px-6 py-3">Plan</th><th className="px-6 py-3">Workspace usage</th><th className="px-6 py-3">Registered</th></tr></thead>
          <tbody>{users.map((user) => <tr key={user.id} className="border-b border-border/80 transition-colors hover:bg-primary/5"><td className="px-6 py-4"><p className="font-medium text-foreground">{user.name}</p><p className="mt-1 flex items-center gap-1.5 font-mono text-xs text-primary"><Mail className="size-3" />{user.email}</p></td><td className="px-6 py-4">{isAdminEmail(user.email) ? <Badge variant="outline" className="border-yellow-400/35 bg-yellow-400/10 text-yellow-100">Admin</Badge> : <Badge variant="outline" className="border-border text-muted-foreground">Member</Badge>}</td><td className="px-6 py-4"><Badge variant="outline" className={planTone(user.subscription?.plan)}>{planLabel(user.subscription?.plan)}</Badge><p className="mt-1 text-xs text-muted-foreground">{user.subscription?.status ?? "No subscription"}{user.subscription?.expiresAt ? ` · expires ${new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(user.subscription.expiresAt)}` : ""}</p></td><td className="px-6 py-4 text-muted-foreground"><span>{user._count.projects} projects</span><span className="mx-2 text-border">·</span><span>{user._count.apiKeys} API keys</span><span className="mx-2 text-border">·</span><span>{user._count.ownedTelegramGroups} groups</span></td><td className="px-6 py-4 text-muted-foreground">{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(user.createdAt)}</td></tr>)}{!users.length && <tr><td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">No registered user records yet.</td></tr>}</tbody>
        </table>
      </CardContent>
    </Card>
  </div>
}

function Metric({ icon: Icon, label, value }: { icon: typeof UsersRound; label: string; value: number }) {
  return <Card className="premium-card"><CardContent className="flex items-center gap-4 p-5"><span className="flex size-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary"><Icon /></span><div><p className="text-2xl font-semibold">{value}</p><p className="text-sm text-muted-foreground">{label}</p></div></CardContent></Card>
}
