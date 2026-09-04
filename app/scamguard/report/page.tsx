import Link from "next/link"
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { decodeSharedScamGuardReport } from "@/lib/scamguard/share-report"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

const riskStyle = {
  SAFE: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  CAUTION: "border-amber-300/45 bg-amber-300/10 text-amber-100",
  HIGH_RISK: "border-rose-400/45 bg-rose-400/10 text-rose-100",
  CRITICAL: "border-rose-400/60 bg-rose-400/15 text-rose-100",
} as const

const riskIcon = {
  SAFE: ShieldCheck,
  CAUTION: AlertTriangle,
  HIGH_RISK: ShieldAlert,
  CRITICAL: ShieldAlert,
} as const

function readableRisk(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase())
}

export default async function ScamGuardSharedReportPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>
}) {
  const { data } = await searchParams
  const report = decodeSharedScamGuardReport(data)

  if (!report) {
    return (
      <main className="premium-page min-h-screen bg-background text-foreground">
        <PublicTopNav />
        <section className="security-grid px-5 py-16 sm:px-8 lg:py-24">
          <Card className="glass-panel premium-card mx-auto max-w-xl border-amber-300/20">
            <CardHeader>
              <Badge variant="outline" className="w-fit border-amber-300/25 bg-amber-300/[0.04] text-amber-100">ScamGuard shared report</Badge>
              <CardTitle className="text-3xl">This shared report link is invalid or incomplete.</CardTitle>
              <CardDescription>Open ScamGuard to run a fresh, evidence-backed check.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Link href="/" className={buttonVariants({ variant: "outline" })}>Home</Link>
              <Link href="/scamguard" className={buttonVariants()}>
                Open ScamGuard <ArrowRight data-icon="inline-end" />
              </Link>
            </CardContent>
          </Card>
        </section>
      </main>
    )
  }

  const Icon = riskIcon[report.riskLevel]
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />
      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:py-16">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <Badge variant="outline" className="mb-4 border-cyan-300/20 bg-cyan-300/[0.04] text-cyan-100">
                <ShieldCheck className="size-3.5" /> ScamGuard shared snapshot
              </Badge>
              <h1 className="max-w-4xl text-3xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">Decision report for {report.target}</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">Portable, privacy-preserving evidence snapshot. Raw wallet payloads, wallet addresses, and query parameters are excluded from the share package.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/" className={cn(buttonVariants({ variant: "ghost" }), "shrink-0")}>Home</Link>
              <Link href="/scamguard" className={cn(buttonVariants(), "glow-primary shrink-0")}>
                Run fresh scan <ExternalLink data-icon="inline-end" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-10 sm:px-8 lg:py-14">
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
          <Card className="glass-panel premium-card">
            <CardHeader className="gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Badge variant="outline" className={cn("mb-4", riskStyle[report.riskLevel])}>{readableRisk(report.riskLevel)}</Badge>
                <CardTitle className="text-2xl text-white">{report.summary}</CardTitle>
                <CardDescription className="mt-3 text-sm leading-6">{report.primaryReason}</CardDescription>
              </div>
              <div className={cn("grid size-16 shrink-0 place-items-center rounded-2xl border", riskStyle[report.riskLevel])}><Icon className="size-7" /></div>
            </CardHeader>
          </Card>

          <Card className="glass-panel premium-card">
            <CardContent className="grid gap-1 p-6">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Shield score</span>
              <strong className="text-5xl font-semibold text-cyan-200">{report.shieldScore}</strong>
              <span className="text-sm text-muted-foreground">Confidence: {report.confidence.toLowerCase()}</span>
              <span className="mt-3 flex items-center gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground"><Clock3 className="size-3.5" /> Shared {new Date(report.generatedAt).toLocaleString()}</span>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <Card className="glass-panel premium-card">
            <CardHeader><CardTitle className="text-lg">Decision path</CardTitle><CardDescription>A short view of the evidence flow behind this result.</CardDescription></CardHeader>
            <CardContent className="grid gap-0">
              {report.timeline.map((item, index) => (
                <div key={`${item.label}-${index}`} className="grid grid-cols-[18px_minmax(0,1fr)] gap-3 border-l border-border/80 pb-5 pl-4 last:border-l-0 last:pb-0">
                  <span className="-ml-[22px] mt-1.5 size-2.5 rounded-full border-2 border-cyan-300 bg-background" />
                  <div><p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">{item.label}</p><p className="mt-1 font-medium text-foreground">{item.value}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{item.status}</p></div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="glass-panel premium-card border-cyan-300/12">
            <CardHeader><CardTitle className="text-lg">Recommended next move</CardTitle><CardDescription>Use a fresh scan before making a high-impact decision.</CardDescription></CardHeader>
            <CardContent><ul className="grid gap-3 text-sm leading-6 text-muted-foreground">{report.actions.map((action) => <li key={action} className="flex gap-2"><CheckCircle2 className="mt-1 size-4 shrink-0 text-cyan-300" />{action}</li>)}</ul></CardContent>
          </Card>
        </section>

        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle className="text-lg">Evidence considered</CardTitle><CardDescription>Signals provide context and should be checked against the final wallet action.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {report.signals.map((signal) => <article key={`${signal.title}-${signal.detail}`} className="rounded-2xl border border-border/80 bg-muted/20 p-4"><p className="text-sm font-medium text-foreground">{signal.title}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{signal.detail}</p></article>)}
          </CardContent>
        </Card>

        <div className="flex flex-col items-start justify-between gap-4 rounded-3xl border border-cyan-300/12 bg-cyan-300/[0.025] p-6 sm:flex-row sm:items-center">
          <div><p className="font-semibold text-white">Need the current state?</p><p className="mt-1 text-sm text-muted-foreground">Shared snapshots do not update after they are created. Run a fresh scan before signing or approving a high-impact action.</p></div>
          <Link href="/scamguard" className={buttonVariants()}>Run fresh scan <ArrowRight data-icon="inline-end" /></Link>
        </div>
      </div>
    </main>
  )
}
