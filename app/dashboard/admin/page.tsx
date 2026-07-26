import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bug,
  CheckCircle2,
  Clock3,
  CreditCard,
  DatabaseZap,
  FileText,
  Gift,
  Layers3,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle,
} from "lucide-react"

import {
  getAdminMetrics,
  getAdminQueueBreakdown,
  getAdminWarnings,
  getRecentAnalyses,
  type AdminWarning,
} from "@/lib/admin/health"
import { getAdminProviderUsage, type ProviderWarningLevel } from "@/lib/admin/provider-usage"
import { getAdminUser } from "@/lib/auth/admin"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

function toneClass(tone: string) {
  if (tone === "good") return "text-green-300"
  if (tone === "warn") return "text-yellow-300"
  if (tone === "bad") return "text-red-300"
  return "text-primary"
}

function toneBorder(tone: string) {
  if (tone === "good") return "border-green-400/30 bg-green-400/10"
  if (tone === "warn") return "border-yellow-400/30 bg-yellow-400/10"
  if (tone === "bad") return "border-red-400/30 bg-red-400/10"
  return "border-primary/30 bg-primary/10"
}

function warningClass(severity: AdminWarning["severity"]) {
  if (severity === "critical") return "border-red-400/30 bg-red-400/10 text-red-100"
  if (severity === "warning") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-100"
  return "border-green-400/30 bg-green-400/10 text-green-100"
}

function warningIcon(severity: AdminWarning["severity"]) {
  if (severity === "critical") return <XCircle className="mt-1 size-5 text-red-300" />
  if (severity === "warning") return <AlertTriangle className="mt-1 size-5 text-yellow-300" />
  return <CheckCircle2 className="mt-1 size-5 text-green-300" />
}

function providerUsageClass(level: ProviderWarningLevel) {
  if (level === "red") return "border-red-400/30 bg-red-400/10 text-red-100"
  if (level === "orange") return "border-orange-400/30 bg-orange-400/10 text-orange-100"
  if (level === "yellow") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-100"
  if (level === "unknown") return "border-slate-400/30 bg-slate-400/10 text-slate-100"
  return "border-green-400/30 bg-green-400/10 text-green-100"
}

function providerUsageLabel(level: ProviderWarningLevel) {
  if (level === "red") return "Critical"
  if (level === "orange") return "High"
  if (level === "yellow") return "Warning"
  if (level === "unknown") return "Unknown"
  return "Healthy"
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

function statusCopy(value: unknown) {
  const status = String(value ?? "-")
  if (status === "completed") return "Completed"
  if (status === "processing") return "Processing"
  if (status === "pending") return "Pending"
  if (status === "failed") return "Failed"
  return status
}

function AccessDenied() {
  return (
    <Card className="glass-panel mx-auto max-w-2xl border-red-400/30">
      <CardHeader>
        <CardTitle className="text-red-200">Admin access required</CardTitle>
        <CardDescription className="text-slate-300">This page is only available for Tri-Proof admin emails.</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-3">
        <Link href="/login" className={buttonVariants()}>Login</Link>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>Back to Dashboard</Link>
      </CardContent>
    </Card>
  )
}

export default async function Page() {
  const admin = await getAdminUser()
  if (!admin) return <AccessDenied />

  const [metrics, analyses, warnings, queue, providerUsage] = await Promise.all([
    getAdminMetrics(),
    getRecentAnalyses(),
    getAdminWarnings(),
    getAdminQueueBreakdown(),
    getAdminProviderUsage(),
  ])
  const health = metrics.find((metric) => metric.label === "System Health")
  const activeQueue = queue.pending + queue.processing

  return (
    <div className="flex flex-col gap-7">
      <div className="dashboard-hero relative overflow-hidden rounded-3xl border border-primary/30 bg-primary/5 p-6 shadow-[0_0_70px_rgba(56,189,248,0.08)]">
        <div className="pointer-events-none absolute right-[-4rem] top-[-5rem] size-56 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-7rem] left-1/4 size-72 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="secondary" className="mb-4 w-fit border-primary/40 bg-primary/10 text-cyan-100">Admin Command Center</Badge>
            <h2 className="text-gradient text-3xl font-semibold sm:text-5xl">Tri-Proof operasyon merkezi</h2>
            <p className="mt-3 max-w-3xl text-slate-300">
              Admin: {admin.email}. Sistem sağlığı, analiz kuyruğu, ödeme akışı, provider limitleri, ScamGuard, blog ve issue takibi buradan yönetilir.
            </p>
          </div>
          <div className={`rounded-2xl border p-5 text-right ${toneBorder(health?.tone ?? "neutral")}`}>
            <p className="text-xs uppercase tracking-wide text-slate-300">Current status</p>
            <p className={`mt-1 text-4xl font-semibold ${toneClass(health?.tone ?? "neutral")}`}>{String(health?.value ?? "Unknown")}</p>
            <p className="mt-1 text-xs text-slate-300">{health?.detail ?? "Live production state"}</p>
          </div>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        {metrics.map((metric, index) => (
          <Card key={metric.label} className={`glass-panel premium-card hover-lift overflow-hidden ${toneBorder(metric.tone)}`}>
            <CardHeader className="pb-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <CardDescription className="text-slate-300">{metric.label}</CardDescription>
                <span className="size-2 rounded-full bg-primary shadow-[0_0_14px_rgba(56,189,248,0.8)]" style={{ animationDelay: `${index * 0.08}s` }} />
              </div>
              <CardTitle className={`text-2xl ${toneClass(metric.tone)}`}>{metric.value}</CardTitle>
              {metric.detail && <p className="pt-1 text-xs text-slate-400">{metric.detail}</p>}
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {providerUsage.map((provider) => (
          <Card key={provider.provider} className={`glass-panel premium-card animated-border ${providerUsageClass(provider.warningLevel)}`}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Activity className="text-primary" /> {provider.label} usage
                  </CardTitle>
                  <CardDescription className="mt-1 text-slate-300">
                    {provider.limitWindow === "monthly" ? "Monthly" : "Daily"} {provider.limitUnit} limit watch.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="border-current text-current">{providerUsageLabel(provider.warningLevel)}</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
                  <span>{formatNumber(provider.used)} / {formatNumber(provider.configuredLimit)} {provider.limitUnit}</span>
                  <span>{provider.usagePercent}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-background/70">
                  <div className="h-full rounded-full bg-current transition-all" style={{ width: `${Math.min(100, provider.usagePercent)}%` }} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-background/45 p-3">
                  <p className="text-xs text-slate-400">Daily requests</p>
                  <p className="text-xl font-semibold text-white">{formatNumber(provider.dailyRequests)}</p>
                </div>
                <div className="rounded-xl border border-border bg-background/45 p-3">
                  <p className="text-xs text-slate-400">Monthly est. credits</p>
                  <p className="text-xl font-semibold text-white">{formatNumber(provider.monthlyEstimatedCredits)}</p>
                </div>
                <div className="rounded-xl border border-border bg-background/45 p-3">
                  <p className="text-xs text-slate-400">Rate limits / 24h</p>
                  <p className="text-xl font-semibold text-white">{formatNumber(provider.rateLimitedLast24h)}</p>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-background/45 p-3 text-xs leading-6 text-slate-300">
                Last rate limit: {provider.lastRateLimitAt ? new Date(provider.lastRateLimitAt).toLocaleString() : "none"}<br />
                Failed provider attempts / 24h: {formatNumber(provider.failedLast24h)}<br />
                {provider.note}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="glass-panel premium-card animated-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white"><AlertTriangle className="text-yellow-300" /> Warning reasons</CardTitle>
            <CardDescription className="text-slate-300">
              “Warning” durumunun sebebi burada açıklanır. Şu an görünen 8 uyarı, {activeQueue} aktif queue batch’i anlamına gelir.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {warnings.map((warning) => (
              <div key={warning.title} className={`rounded-2xl border p-4 ${warningClass(warning.severity)}`}>
                <div className="flex gap-3">
                  {warningIcon(warning.severity)}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-white">{warning.title}</p>
                      {typeof warning.count === "number" && <Badge variant="outline" className="border-current text-current">{warning.count}</Badge>}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-200">{warning.detail}</p>
                    <Link href={warning.href} className={`${buttonVariants({ variant: "outline" })} mt-3 text-white`}>{warning.action} <ArrowRight data-icon="inline-end" /></Link>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card animated-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white"><Layers3 className="text-primary" /> Queue breakdown</CardTitle>
            <CardDescription className="text-slate-300">Background analysis batch durumları.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {[
              ["Pending", queue.pending, "Waiting for worker", "text-yellow-300"],
              ["Processing", queue.processing, "Currently running", "text-cyan-300"],
              ["Stale", queue.staleProcessing, "Older than 15 min", "text-red-300"],
              ["Failed", queue.failed, "Needs inspection", "text-red-300"],
              ["Completed", queue.completed, "Finished batches", "text-green-300"],
            ].map(([label, value, detail, color]) => (
              <div key={label as string} className="flex items-center justify-between rounded-xl border border-border bg-background/45 p-3">
                <div>
                  <p className="font-medium text-white">{label as string}</p>
                  <p className="text-xs text-slate-400">{detail as string}</p>
                </div>
                <p className={`text-2xl font-semibold ${color as string}`}>{String(value)}</p>
              </div>
            ))}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-6 text-slate-300">
              <Clock3 className="mb-2 size-4 text-primary" />
              Oldest pending: {queue.oldestPendingAt ? new Date(queue.oldestPendingAt).toLocaleString() : "none"}<br />
              Oldest processing: {queue.oldestProcessingAt ? new Date(queue.oldestProcessingAt).toLocaleString() : "none"}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          [ShieldCheck, "System Health", "Database, API keys, treasury wallets and worker queue.", "/dashboard/admin/diagnostics"],
          [ShieldAlert, "ScamGuard Solana", "Public pre-sign scanner for suspicious Solana links, tokens and transaction intent.", "/scamguard"],
          [Gift, "Airdrop Review", "Approve contribution proofs and credit Season 0 task points.", "/dashboard/admin/airdrop"],
          [Bug, "Issue Tracker", "Track bugs, broken flows, visual issues and Codex tasks.", "/dashboard/admin/bugs"],
          [Activity, "Analysis Ops", "Review recent wallet analyses and failed jobs.", "/dashboard/admin/analyses"],
          [CreditCard, "Payments", "USDC checkout configuration and manual payment notes.", "/dashboard/admin/payments"],
          [FileText, "Blog Studio", "Create SEO-ready Web3 security articles with cover images.", "/dashboard/admin/blog"],
          [Wrench, "Maintenance", "Run health checks and operational follow-up tasks.", "/dashboard/admin/diagnostics"],
        ].map(([Icon, title, text, href], index) => (
          <Card key={title as string} className="glass-panel premium-card hover-lift animated-border">
            <CardHeader>
              <div className="mb-2 flex items-center justify-between">
                <Icon className="text-primary" />
                <Sparkles className="size-4 text-primary/60" style={{ animationDelay: `${index * 0.08}s` }} />
              </div>
              <CardTitle className="text-white">{title as string}</CardTitle>
              <CardDescription className="text-slate-300">{text as string}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={href as string} className={`${buttonVariants({ variant: "outline" })} text-white`}>Open</Link>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white"><DatabaseZap className="text-primary" /> Recent analyses</CardTitle>
          <CardDescription className="text-slate-300">Latest analysis jobs from production.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-300">
              <tr><th className="py-2">Project</th><th>Status</th><th>Chain</th><th>Mode</th><th>Wallets</th><th>Created</th></tr>
            </thead>
            <tbody>
              {analyses.map((item) => {
                const row = item as Record<string, unknown>
                const status = String(row.status ?? "-")
                return (
                  <tr key={String(row.id)} className="border-t border-border transition-colors hover:bg-primary/5">
                    <td className="py-3 font-medium text-white">{String(row.projectName ?? "-")}</td>
                    <td><Badge variant="outline" className={status === "completed" ? "border-green-400/30 text-green-200" : status === "failed" ? "border-red-400/30 text-red-200" : "border-yellow-400/30 text-yellow-200"}>{statusCopy(row.status)}</Badge></td>
                    <td className="text-slate-300">{String(row.chain ?? "-")}</td>
                    <td className="text-slate-300">{String(row.analysisMode ?? "-")}</td>
                    <td className="text-slate-300">{String(row.totalWallets ?? 0)}</td>
                    <td className="text-slate-400">{row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : "-"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
