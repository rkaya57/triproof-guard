"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, Gauge, Layers3, Percent, ShieldAlert, ShieldCheck, Sparkles, WalletCards } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { MetricCard } from "@/components/dashboard/metric-card"
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
      <div className="flex animate-in fade-in flex-col gap-6">
        <div className="dashboard-hero h-36 animate-pulse rounded-2xl" />
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="glass-panel h-36 animate-pulse" />
          ))}
        </div>
        <Card className="glass-panel h-72 animate-pulse" />
      </div>
    )
  }

  if (unauthorized) {
    return (
      <Card className="glass-panel premium-card max-w-2xl">
        <CardHeader>
          <CardTitle>Sign in to start analysis</CardTitle>
          <CardDescription>
            Create an account or open the demo report to review the live product workflow.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Link href="/login" className={`${buttonVariants()} glow-primary hover-lift`}>
            Login
          </Link>
          <Link href="/dashboard/demo" className={`${buttonVariants({ variant: "outline" })} hover-lift`}>
            Open Demo Report
          </Link>
        </CardContent>
      </Card>
    )
  }

  const stats = data?.stats ?? {
    projectCount: 0,
    totalWallets: 0,
    averageRiskScore: 0,
    highRiskRate: 0,
  }
  const security = data?.security ?? {
    sybilSafetyScore: Math.max(0, Math.round(100 - stats.averageRiskScore)),
    scamGuardReadinessScore: 76,
    unifiedSecurityScore: Math.max(0, Math.round(100 - stats.averageRiskScore)),
    scamGuardStatus: "active",
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="dashboard-hero reveal-up rounded-2xl p-6 sm:p-8">
        <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <Badge variant="secondary" className="mb-4 gap-2 border-primary/30 text-primary">
              <span className="pulse-dot" /> Guard Product Active
            </Badge>
            <h2 className="text-gradient animate-gradient-text text-3xl font-semibold sm:text-4xl">
              Welcome, {data?.user.name ?? "analyst"}
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Upload a wallet CSV, run risk analysis, review suspicious clusters and export cleaner reward lists.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
            <Link href="/dashboard/new-analysis" className={`${buttonVariants()} glow-primary hover-lift`}>
              New Analysis <ArrowRight data-icon="inline-end" />
            </Link>
            <Link href="/dashboard/demo" className={`${buttonVariants({ variant: "outline" })} hover-lift`}>
              Demo Report
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="reveal-up delay-100">
          <MetricCard
            title="Total projects"
            value={formatNumber(stats.projectCount)}
            description="Campaigns created in this workspace."
            icon={Layers3}
          />
        </div>
        <div className="reveal-up delay-200">
          <MetricCard
            title="Wallets analyzed"
            value={formatNumber(stats.totalWallets)}
            description="Valid wallet rows scored by the risk engine."
            icon={WalletCards}
          />
        </div>
        <div className="reveal-up delay-300">
          <MetricCard
            title="Average risk score"
            value={String(stats.averageRiskScore)}
            description="Mean probabilistic wallet risk across analyses."
            icon={Gauge}
          />
        </div>
        <div className="reveal-up delay-400">
          <MetricCard
            title="Rejected wallet rate"
            value={`${stats.highRiskRate}%`}
            description="Rejected wallets as a share of analyzed rows."
            icon={Percent}
          />
        </div>
      </div>

      <Card className="glass-panel premium-card animated-border reveal-up delay-500 overflow-hidden">
        <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="text-primary" /> Unified Security Score
            </CardTitle>
            <CardDescription>
              Combines wallet Sybil safety with ScamGuard pre-sign readiness for one operational view.
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit border-green-400/30 bg-green-400/10 text-green-200">
            ScamGuard {security.scamGuardStatus}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[220px_1fr_auto] lg:items-center">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Unified score</p>
            <p className="text-gradient mt-2 text-5xl font-semibold">{security.unifiedSecurityScore}</p>
            <p className="mt-2 text-xs text-muted-foreground">higher is safer</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-background/45 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-medium"><Gauge className="size-4 text-primary" /> Sybil safety</span>
                <span className="font-mono text-primary">{security.sybilSafetyScore}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-primary" style={{ width: `${security.sybilSafetyScore}%` }} />
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Derived from average wallet risk across workspace analyses.</p>
            </div>
            <div className="rounded-xl border border-border bg-background/45 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-medium"><ShieldAlert className="size-4 text-primary" /> ScamGuard readiness</span>
                <span className="font-mono text-primary">{security.scamGuardReadinessScore}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-primary" style={{ width: `${security.scamGuardReadinessScore}%` }} />
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Public scanner, pre-sign transaction review and B2B API are active.</p>
            </div>
          </div>
          <Link href="/scamguard" className={`${buttonVariants({ variant: "outline" })} hover-lift text-white`}>
            Open ScamGuard <ArrowRight data-icon="inline-end" />
          </Link>
        </CardContent>
      </Card>

      <Card className="glass-panel premium-card reveal-up delay-500">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Recent analyses</CardTitle>
            <CardDescription>Latest campaign risk runs for this account.</CardDescription>
          </div>
          <Badge variant="outline" className="gap-2 border-primary/30 text-primary">
            <Sparkles className="size-3.5" /> Live workspace
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!data?.recentAnalyses.length && (
            <div className="premium-card data-scan flex animate-in fade-in zoom-in-95 flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-background/40 px-6 py-12 text-center">
              <span className="glow-primary flex size-14 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary">
                <WalletCards className="size-6" aria-hidden />
              </span>
              <div>
                <p className="font-medium text-foreground">No analyses yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upload a wallet CSV to run your first risk analysis, or explore the demo report.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <Link href="/dashboard/new-analysis" className={`${buttonVariants()} glow-primary hover-lift`}>
                  New Analysis
                </Link>
                <Link href="/dashboard/demo" className={`${buttonVariants({ variant: "outline" })} hover-lift`}>
                  Open Demo Report
                </Link>
              </div>
            </div>
          )}
          {data?.recentAnalyses.map((analysis) => (
            <Link
              key={analysis.id}
              href={`/dashboard/analysis/${analysis.id}`}
              className="premium-card hover-lift grid gap-3 rounded-xl border border-border bg-background/45 p-4 transition-colors hover:border-primary/35 hover:bg-primary/5 md:grid-cols-[1fr_120px_120px_120px]"
            >
              <div>
                <div className="font-medium">{analysis.projectName}</div>
                <div className="text-sm text-muted-foreground">
                  {analysis.campaignType} on {analysis.chain}
                </div>
              </div>
              <Badge variant="secondary" className="w-fit capitalize">{analysis.status}</Badge>
              <span className="text-sm text-muted-foreground">
                {formatNumber(analysis.totalWallets)} wallets
              </span>
              <span className="text-sm text-muted-foreground">
                Avg risk {analysis.averageRiskScore}
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
