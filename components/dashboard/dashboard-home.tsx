"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, Gauge, Layers3, Percent, ShieldAlert, ShieldCheck, Sparkles, WalletCards } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNumber } from "@/lib/format"

type DashboardResponse = {
  user: { name: string; email: string }
  stats: {
    projectCount: number
    totalWallets: number
    averageRiskScore: number
    highRiskRate: number
  }
  security?: {
    sybilSafetyScore: number
    scamGuardReadinessScore: number
    unifiedSecurityScore: number
    scamGuardStatus: string
  }
  recentAnalyses: Array<{
    id: string
    projectName: string
    campaignType: string
    chain: string
    status: string
    totalWallets: number
    averageRiskScore: number
    rejectedCount: number
    createdAt: string
  }>
}

function statShell(tone: string) {
  if (tone === "emerald") return "border-emerald-400/20 bg-emerald-400/[0.04]"
  if (tone === "violet") return "border-violet-400/20 bg-violet-400/[0.04]"
  if (tone === "amber") return "border-amber-400/20 bg-amber-400/[0.04]"
  return "border-cyan-400/20 bg-cyan-400/[0.04]"
}

export function DashboardHome() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [unauthorized, setUnauthorized] = useState(false)

  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (response) => {
        if (response.status === 401) {
          setUnauthorized(true)
          return null
        }
        return (await response.json()) as DashboardResponse
      })
      .then((body) => {
        if (body) setData(body)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="grid animate-in gap-5 fade-in">
        <div className="h-48 animate-pulse rounded-3xl border border-white/[0.06] bg-white/[0.025]" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]" />)}
        </div>
        <div className="h-64 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]" />
      </div>
    )
  }

  if (unauthorized) {
    return (
      <Card className="glass-panel max-w-2xl border-cyan-400/20">
        <CardHeader><CardTitle>Sign in to start analysis</CardTitle><CardDescription>Create an account or open the demo report to review the product workflow.</CardDescription></CardHeader>
        <CardContent className="flex gap-3"><Link href="/login" className={buttonVariants()}>Login</Link><Link href="/dashboard/demo" className={buttonVariants({ variant: "outline" })}>Open Demo Report</Link></CardContent>
      </Card>
    )
  }

  const stats = data?.stats ?? { projectCount: 0, totalWallets: 0, averageRiskScore: 0, highRiskRate: 0 }
  const security = data?.security ?? {
    sybilSafetyScore: Math.max(0, Math.round(100 - stats.averageRiskScore)),
    scamGuardReadinessScore: 76,
    unifiedSecurityScore: Math.max(0, Math.round(100 - stats.averageRiskScore)),
    scamGuardStatus: "active",
  }

  const statCards = [
    [Layers3, "Campaigns", formatNumber(stats.projectCount), "Projects in this workspace", "cyan"],
    [WalletCards, "Wallets analyzed", formatNumber(stats.totalWallets), "Wallet rows scored", "violet"],
    [Gauge, "Average risk", String(stats.averageRiskScore), "Workspace mean risk score", "amber"],
    [Percent, "Rejected rate", `${stats.highRiskRate}%`, "Rejected share of analyzed wallets", "emerald"],
  ] as const

  return (
    <div className="grid gap-5">
      <section className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-[linear-gradient(120deg,rgba(8,47,73,.54),rgba(15,23,42,.92)_52%,rgba(91,33,182,.18))] p-6 shadow-[0_0_80px_rgba(34,211,238,.06)] sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full border border-cyan-300/10 bg-cyan-400/[0.04]" />
        <div className="pointer-events-none absolute -bottom-36 left-1/3 size-72 rounded-full bg-violet-500/[0.06] blur-3xl" />
        <div className="relative z-10 grid gap-7 xl:grid-cols-[1fr_auto] xl:items-end">
          <div>
            <Badge variant="outline" className="mb-4 border-emerald-400/25 bg-emerald-400/[0.05] text-emerald-200"><span className="mr-2 size-1.5 rounded-full bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,.8)]" /> Security workspace active</Badge>
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">Welcome back, {data?.user.name ?? "analyst"}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base">Audit campaign wallet lists, investigate coordinated behavior, review evidence and move from raw addresses to explainable reward decisions.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/new-analysis" className={`${buttonVariants()} border border-cyan-300/20 bg-cyan-400/90 text-slate-950 shadow-[0_0_24px_rgba(34,211,238,.12)] hover:bg-cyan-300`}>New analysis <ArrowRight className="size-4" /></Link>
            <Link href="/dashboard/campaigns" className={`${buttonVariants({ variant: "outline" })} border-white/10 bg-white/[0.025] text-slate-200`}>Campaigns</Link>
            <Link href="/dashboard/demo" className={`${buttonVariants({ variant: "outline" })} border-white/10 bg-white/[0.025] text-slate-200`}>Demo report</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(([Icon, label, value, detail, tone]) => (
          <div key={label} className={`rounded-2xl border p-5 ${statShell(tone)}`}>
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs uppercase tracking-[0.13em] text-slate-500">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p></div>
              <span className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-2"><Icon className="size-5 text-cyan-300" /></span>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">{detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[.82fr_1.18fr]">
        <Card className="glass-panel overflow-hidden border-cyan-400/20">
          <CardHeader className="border-b border-white/[0.06]"><div className="flex items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-white"><ShieldCheck className="size-5 text-cyan-300" /> Security posture</CardTitle><CardDescription className="mt-1 text-slate-400">Unified Sybil and pre-sign protection readiness.</CardDescription></div><Badge variant="outline" className="border-emerald-400/25 bg-emerald-400/[0.04] text-emerald-200">ScamGuard {security.scamGuardStatus}</Badge></div></CardHeader>
          <CardContent className="grid gap-4 p-5">
            <div className="grid gap-4 sm:grid-cols-[150px_1fr] sm:items-center">
              <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.04] p-5 text-center"><p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Unified score</p><p className="mt-2 text-5xl font-semibold text-cyan-200">{security.unifiedSecurityScore}</p><p className="mt-1 text-xs text-slate-500">higher is safer</p></div>
              <div className="space-y-4">
                {[["Sybil safety", security.sybilSafetyScore, Gauge], ["ScamGuard readiness", security.scamGuardReadinessScore, ShieldAlert]].map(([label, value, Icon]) => (
                  <div key={label as string}>
                    <div className="mb-2 flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-slate-300"><Icon className="size-4 text-cyan-300" />{label as string}</span><span className="font-mono text-cyan-200">{String(value)}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-950/70"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500" style={{ width: `${Number(value)}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
            <Link href="/scamguard" className={`${buttonVariants({ variant: "outline" })} w-fit border-cyan-400/15 text-slate-200`}>Open ScamGuard <ArrowRight className="size-4" /></Link>
          </CardContent>
        </Card>

        <Card className="glass-panel overflow-hidden border-violet-400/15">
          <CardHeader className="border-b border-white/[0.06]"><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-white">Recent analyses</CardTitle><CardDescription className="mt-1 text-slate-400">Latest campaign risk runs in your workspace.</CardDescription></div><Badge variant="outline" className="border-violet-400/20 text-violet-200"><Sparkles className="mr-1 size-3" /> Live</Badge></div></CardHeader>
          <CardContent className="p-3">
            {!data?.recentAnalyses.length ? (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.015] px-6 py-10 text-center"><span className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3"><WalletCards className="size-6 text-cyan-300" /></span><div><p className="font-medium text-white">No analyses yet</p><p className="mt-1 text-sm text-slate-500">Run a wallet list or inspect the demo report.</p></div><Link href="/dashboard/new-analysis" className={buttonVariants({ size: "sm" })}>Start analysis</Link></div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {data.recentAnalyses.slice(0, 6).map((analysis) => (
                  <Link key={analysis.id} href={`/dashboard/analysis/${analysis.id}`} className="grid gap-3 rounded-xl px-3 py-4 transition-colors hover:bg-cyan-400/[0.035] sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <div className="min-w-0"><p className="truncate font-medium text-white">{analysis.projectName}</p><p className="mt-1 truncate text-xs text-slate-500">{analysis.campaignType} · {analysis.chain}</p></div>
                    <div className="flex items-center gap-2"><Badge variant="outline" className="capitalize border-white/10 text-slate-300">{analysis.status}</Badge><span className="text-xs text-slate-500">{formatNumber(analysis.totalWallets)} wallets</span></div>
                    <div className="text-right"><p className="text-xs text-slate-500">Avg risk</p><p className="font-mono text-sm text-cyan-200">{analysis.averageRiskScore}</p></div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
