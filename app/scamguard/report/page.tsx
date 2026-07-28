import Link from "next/link"
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react"

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
      <main className="min-h-screen bg-background px-4 py-16 sm:px-6">
        <Card className="mx-auto max-w-xl border-border/80 bg-card/90 shadow-2xl shadow-black/20">
          <CardHeader>
            <Badge variant="outline" className="w-fit">ScamGuard report</Badge>
            <CardTitle className="text-3xl">This shared report link is invalid or incomplete.</CardTitle>
            <CardDescription>Open the live scanner to run a fresh, evidence-backed check.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/scamguard" className={buttonVariants()}>
              Open ScamGuard <ArrowRight data-icon="inline-end" />
            </Link>
          </CardContent>
        </Card>
      </main>
    )
  }

  const Icon = riskIcon[report.riskLevel]
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.13),transparent_32%),hsl(var(--background))] px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto grid max-w-5xl gap-6">
        <header className="flex flex-col justify-between gap-4 border-b border-border/80 pb-6 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4 text-cyan-300" /> ScamGuard shared snapshot</div>
            <h1 className="text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">Decision report for {report.target}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">This is a portable, privacy-preserving report snapshot. It excludes raw wallet payloads, wallet addresses, and query parameters.</p>
          </div>
          <Link href="/scamguard" className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}>
            Run fresh scan <ExternalLink data-icon="inline-end" />
          </Link>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
          <Card className="border-border/80 bg-card/90 shadow-xl shadow-black/10">
            <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Badge variant="outline" className={cn("mb-3", riskStyle[report.riskLevel])}>{readableRisk(report.riskLevel)}</Badge>
                <CardTitle className="text-2xl">{report.summary}</CardTitle>
                <CardDescription className="mt-3 text-sm leading-6">{report.primaryReason}</CardDescription>
              </div>
              <div className={cn("grid size-16 shrink-0 place-items-center rounded-lg border", riskStyle[report.riskLevel])}><Icon className="size-7" /></div>
            </CardHeader>
          </Card>

          <Card className="border-border/80 bg-card/90">
            <CardContent className="grid gap-1 p-5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Shield score</span>
              <strong className="text-5xl font-semibold text-cyan-200">{report.shieldScore}</strong>
              <span className="text-sm text-muted-foreground">Confidence: {report.confidence.toLowerCase()}</span>
              <span className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-3.5" /> Shared {new Date(report.generatedAt).toLocaleString()}</span>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <Card className="border-border/80 bg-card/90">
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

          <Card className="border-border/80 bg-card/90">
            <CardHeader><CardTitle className="text-lg">Recommended next move</CardTitle><CardDescription>Use a fresh scan before making a high-impact decision.</CardDescription></CardHeader>
            <CardContent><ul className="grid gap-3 text-sm leading-6 text-muted-foreground">{report.actions.map((action) => <li key={action} className="flex gap-2"><CheckCircle2 className="mt-1 size-4 shrink-0 text-cyan-300" />{action}</li>)}</ul></CardContent>
          </Card>
        </section>

        <Card className="border-border/80 bg-card/90">
          <CardHeader><CardTitle className="text-lg">Evidence considered</CardTitle><CardDescription>Signals are context, not a substitute for checking the wallet popup itself.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {report.signals.map((signal) => <article key={`${signal.title}-${signal.detail}`} className="rounded-lg border border-border/80 bg-muted/20 p-4"><p className="text-sm font-medium text-foreground">{signal.title}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{signal.detail}</p></article>)}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
