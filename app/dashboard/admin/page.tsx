import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Bug,
  CheckCircle2,
  Clock3,
  CreditCard,
  DatabaseZap,
  DollarSign,
  FileText,
  Gift,
  Layers3,
  ReceiptText,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  UsersRound,
  WalletCards,
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
import { getAdminSalesOverview } from "@/lib/admin/sales"
import { getAdminUser } from "@/lib/auth/admin"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

function toneClass(tone: string) {
  if (tone === "good") return "text-emerald-300"
  if (tone === "warn") return "text-amber-300"
  if (tone === "bad") return "text-rose-300"
  return "text-cyan-300"
}

function toneBorder(tone: string) {
  if (tone === "good") return "border-emerald-400/25 bg-emerald-400/[0.06]"
  if (tone === "warn") return "border-amber-400/25 bg-amber-400/[0.06]"
  if (tone === "bad") return "border-rose-400/25 bg-rose-400/[0.06]"
  return "border-cyan-400/25 bg-cyan-400/[0.05]"
}

function warningClass(severity: AdminWarning["severity"]) {
  if (severity === "critical") return "border-rose-400/30 bg-rose-400/[0.08] text-rose-100"
  if (severity === "warning") return "border-amber-400/30 bg-amber-400/[0.08] text-amber-100"
  return "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-100"
}

function warningIcon(severity: AdminWarning["severity"]) {
  if (severity === "critical") return <XCircle className="mt-1 size-5 text-rose-300" />
  if (severity === "warning") return <AlertTriangle className="mt-1 size-5 text-amber-300" />
  return <CheckCircle2 className="mt-1 size-5 text-emerald-300" />
}

function providerUsageClass(level: ProviderWarningLevel) {
  if (level === "red") return "border-rose-400/25"
  if (level === "orange") return "border-orange-400/25"
  if (level === "yellow") return "border-amber-400/25"
  if (level === "unknown") return "border-slate-400/25"
  return "border-emerald-400/20"
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

function formatUsdc(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function statusCopy(value: unknown) {
  const status = String(value ?? "-")
  if (status === "completed") return "Completed"
  if (status === "processing") return "Processing"
  if (status === "pending") return "Pending"
  if (status === "failed") return "Failed"
  return status
}

function friendlyPlan(plan: string) {
  return plan.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase())
}

function AccessDenied() {
  return (
    <Card className="glass-panel mx-auto max-w-2xl border-rose-400/30">
      <CardHeader>
        <CardTitle className="text-rose-200">Admin access required</CardTitle>
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

  const [metrics, analyses, warnings, queue, providerUsage, sales] = await Promise.all([
    getAdminMetrics(),
    getRecentAnalyses(),
    getAdminWarnings(),
    getAdminQueueBreakdown(),
    getAdminProviderUsage(),
    getAdminSalesOverview(),
  ])

  const health = metrics.find((metric) => metric.label === "System Health")
  const users = metrics.find((metric) => metric.label === "Users")
  const totalAnalyses = metrics.find((metric) => metric.label === "Total Analyses")
  const walletsProcessed = metrics.find((metric) => metric.label === "Wallets Processed")
  const activeQueue = queue.pending + queue.processing
  const maxPlanRevenue = Math.max(1, ...sales.planBreakdown.map((item) => item.revenueUsdc))

  return (
    <div className="flex flex-col gap-6 pb-10">
      <section className="relative overflow-hidden rounded-3xl border border-cyan-400/25 bg-[linear-gradient(120deg,rgba(8,47,73,.72),rgba(15,23,42,.94)_48%,rgba(76,29,149,.24))] p-6 shadow-[0_0_90px_rgba(56,189,248,.08)] sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full border border-cyan-300/20 bg-cyan-400/10" />
        <div className="pointer-events-none absolute -bottom-36 right-1/4 size-80 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <Badge variant="secondary" className="mb-4 border-cyan-400/35 bg-cyan-400/10 text-cyan-100">Operations Command Center</Badge>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">Tri-Proof Admin Center</h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-300">
              Revenue, customers, analyses, provider capacity, queues and security operations in one production view. Signed in as {admin.email}.
            </p>
          </div>
          <div className={`min-w-52 rounded-2xl border p-5 ${toneBorder(health?.tone ?? "neutral")}`}>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">System status</p>
            <p className={`mt-2 text-3xl font-semibold ${toneClass(health?.tone ?? "neutral")}`}>{String(health?.value ?? "Unknown")}</p>
            <p className="mt-2 max-w-56 text-xs leading-5 text-slate-300">{health?.detail ?? "Live production state"}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[
          [DollarSign, "Total Revenue", `${formatUsdc(sales.totalRevenueUsdc)} USDC`, `${sales.salesLast30Days} verified sales in last 30 days`, "text-emerald-300", "border-emerald-400/20 bg-emerald-400/[0.05]"],
          [ShoppingCart, "Total Sales", formatNumber(sales.totalSales), "All verified checkout payments", "text-violet-300", "border-violet-400/20 bg-violet-400/[0.05]"],
          [TrendingUp, "30D Revenue", `${formatUsdc(sales.revenueLast30DaysUsdc)} USDC`, "Verified revenue in last 30 days", "text-cyan-300", "border-cyan-400/20 bg-cyan-400/[0.05]"],
          [ReceiptText, "Avg. Order", `${formatUsdc(sales.averageOrderValueUsdc)} USDC`, "Average verified transaction", "text-blue-300", "border-blue-400/20 bg-blue-400/[0.05]"],
          [WalletCards, "Active Plans", formatNumber(sales.activeSubscriptions), "Active subscriptions", "text-amber-300", "border-amber-400/20 bg-amber-400/[0.05]"],
          [UsersRound, "Users", String(users?.value ?? "0"), users?.detail ?? "Registered accounts", "text-sky-300", "border-sky-400/20 bg-sky-400/[0.05]"],
        ].map(([Icon, label, value, detail, color, shell]) => (
          <Card key={label as string} className={`glass-panel overflow-hidden ${shell as string}`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.13em] text-slate-400">{label as string}</p>
                  <p className={`mt-3 text-2xl font-semibold ${color as string}`}>{value as string}</p>
                </div>
                <span className="rounded-xl border border-white/10 bg-white/[0.04] p-2"><Icon className={`size-5 ${color as string}`} /></span>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-400">{detail as string}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section>
        <Card className="glass-panel overflow-hidden border-cyan-400/20">
          <CardHeader className="border-b border-border/70">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-white"><DollarSign className="text-emerald-300" /> Revenue overview</CardTitle>
                <CardDescription className="mt-1 text-slate-300">Verified on-site payments only. Failed and pending transactions are excluded.</CardDescription>
              </div>
              <Link href="/dashboard/admin/payments" className={buttonVariants({ variant: "outline" })}>View payments <ArrowRight /></Link>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 p-5 lg:grid-cols-[.75fr_1.25fr]">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-5">
              <p className="text-sm text-slate-400">Lifetime verified revenue</p>
              <p className="mt-2 text-4xl font-semibold text-white">{formatUsdc(sales.totalRevenueUsdc)} <span className="text-lg text-emerald-300">USDC</span></p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-background/35 p-3"><p className="text-xs text-slate-400">Orders</p><p className="mt-1 text-xl font-semibold text-white">{sales.totalSales}</p></div>
                <div className="rounded-xl border border-border bg-background/35 p-3"><p className="text-xs text-slate-400">30D sales</p><p className="mt-1 text-xl font-semibold text-white">{sales.salesLast30Days}</p></div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between"><p className="font-medium text-white">Sales by plan</p><p className="text-xs text-slate-400">Revenue share</p></div>
              {sales.planBreakdown.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-slate-400">No verified sales yet.</div>
              ) : sales.planBreakdown.map((item) => (
                <div key={item.plan}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-200">{friendlyPlan(item.plan)} <span className="text-slate-500">· {item.sales} sale{item.sales === 1 ? "" : "s"}</span></span>
                    <span className="font-medium text-white">{formatUsdc(item.revenueUsdc)} USDC</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-950/70"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500" style={{ width: `${Math.max(5, (item.revenueUsdc / maxPlanRevenue) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["System Health", health?.value ?? "Unknown", health?.detail ?? "Live production state", health?.tone ?? "neutral"],
          ["Total Analyses", totalAnalyses?.value ?? "0", totalAnalyses?.detail ?? "Created analysis jobs", totalAnalyses?.tone ?? "neutral"],
          ["Wallets Processed", walletsProcessed?.value ?? "0", walletsProcessed?.detail ?? "Submitted wallets", walletsProcessed?.tone ?? "neutral"],
          ["Active Queue", activeQueue, `${queue.pending} pending / ${queue.processing} processing`, activeQueue > 0 ? "warn" : "good"],
        ].map(([label, value, detail, tone]) => (
          <Card key={label as string} className={`glass-panel ${toneBorder(String(tone))}`}>
            <CardContent className="p-5"><p className="text-xs uppercase tracking-[0.12em] text-slate-400">{label as string}</p><p className={`mt-2 text-2xl font-semibold ${toneClass(String(tone))}`}>{String(value)}</p><p className="mt-2 text-xs text-slate-400">{String(detail)}</p></CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {providerUsage.map((provider) => (
          <Card key={provider.provider} className={`glass-panel ${providerUsageClass(provider.warningLevel)}`}>
            <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base text-white"><Activity className="size-4 text-cyan-300" /> {provider.label}</CardTitle><CardDescription className="mt-1 text-xs text-slate-400">{provider.limitWindow === "monthly" ? "Monthly" : "Daily"} {provider.limitUnit} usage</CardDescription></div><Badge variant="outline" className="border-emerald-400/25 text-emerald-200">{providerUsageLabel(provider.warningLevel)}</Badge></div></CardHeader>
            <CardContent className="space-y-4"><div><div className="mb-2 flex justify-between text-xs text-slate-400"><span>{formatNumber(provider.used)} / {formatNumber(provider.configuredLimit)}</span><span>{provider.usagePercent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-950/70"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${Math.min(100, provider.usagePercent)}%` }} /></div></div><div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl border border-border p-2"><p className="text-[10px] text-slate-500">Daily</p><p className="font-medium text-white">{formatNumber(provider.dailyRequests)}</p></div><div className="rounded-xl border border-border p-2"><p className="text-[10px] text-slate-500">Monthly est.</p><p className="font-medium text-white">{formatNumber(provider.monthlyEstimatedCredits)}</p></div><div className="rounded-xl border border-border p-2"><p className="text-[10px] text-slate-500">Rate limits</p><p className="font-medium text-white">{formatNumber(provider.rateLimitedLast24h)}</p></div></div></CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
        <Card className="glass-panel border-amber-400/20">
          <CardHeader><CardTitle className="flex items-center gap-2 text-white"><AlertTriangle className="text-amber-300" /> Operational warnings</CardTitle><CardDescription className="text-slate-300">Actionable issues requiring admin attention.</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            {warnings.map((warning) => (
              <div key={warning.title} className={`rounded-2xl border p-4 ${warningClass(warning.severity)}`}><div className="flex gap-3">{warningIcon(warning.severity)}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-white">{warning.title}</p>{typeof warning.count === "number" && <Badge variant="outline" className="border-current text-current">{warning.count}</Badge>}</div><p className="mt-2 text-sm leading-6 text-slate-200">{warning.detail}</p><Link href={warning.href} className={`${buttonVariants({ variant: "outline" })} mt-3 text-white`}>{warning.action} <ArrowRight /></Link></div></div></div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-panel border-cyan-400/20">
          <CardHeader><CardTitle className="flex items-center gap-2 text-white"><Layers3 className="text-cyan-300" /> Queue breakdown</CardTitle><CardDescription className="text-slate-300">Background analysis batch status.</CardDescription></CardHeader>
          <CardContent className="grid gap-2">
            {[["Pending", queue.pending, "text-amber-300"],["Processing", queue.processing, "text-cyan-300"],["Stale", queue.staleProcessing, "text-rose-300"],["Failed", queue.failed, "text-rose-300"],["Completed", queue.completed, "text-emerald-300"]].map(([label, value, color]) => <div key={label as string} className="flex items-center justify-between rounded-xl border border-border bg-background/35 p-3"><span className="text-sm text-slate-300">{label as string}</span><span className={`text-xl font-semibold ${color as string}`}>{String(value)}</span></div>)}
            <div className="mt-1 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3 text-xs leading-6 text-slate-400"><Clock3 className="mb-2 size-4 text-cyan-300" />Oldest pending: {queue.oldestPendingAt ? new Date(queue.oldestPendingAt).toLocaleString() : "none"}<br />Oldest processing: {queue.oldestProcessingAt ? new Date(queue.oldestProcessingAt).toLocaleString() : "none"}</div>
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between"><div><h2 className="text-xl font-semibold text-white">Operations</h2><p className="text-sm text-slate-400">Jump directly into the subsystem you need.</p></div></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            [ShieldCheck, "System Health", "Production diagnostics", "/dashboard/admin/diagnostics"],
            [ShieldAlert, "ScamGuard Intel", "Threat intelligence", "/dashboard/admin/scamguard"],
            [Bot, "Telegram Guardian", "Protected groups", "/dashboard/admin/telegram"],
            [Gift, "Airdrop Review", "Approve contribution proofs", "/dashboard/admin/airdrop"],
            [Bug, "Issue Tracker", "Product issues", "/dashboard/admin/bugs"],
            [Activity, "Analysis Ops", "Jobs and failures", "/dashboard/admin/analyses"],
            [CreditCard, "Payments", "Transactions and checkout", "/dashboard/admin/payments"],
            [UsersRound, "Users", "Accounts and plans", "/dashboard/admin/users"],
            [FileText, "Blog Studio", "Security content", "/dashboard/admin/blog"],
            [Wrench, "Maintenance", "Operational checks", "/dashboard/admin/diagnostics"],
          ].map(([Icon, title, text, href]) => (
            <Link key={title as string} href={href as string} className="group rounded-2xl border border-cyan-400/15 bg-slate-950/35 p-4 transition-all hover:-translate-y-0.5 hover:border-cyan-400/35 hover:bg-cyan-400/[0.04]"><div className="flex items-center justify-between"><span className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.05] p-2"><Icon className="size-4 text-cyan-300" /></span><ArrowRight className="size-4 text-slate-600 transition group-hover:text-cyan-300" /></div><p className="mt-4 font-medium text-white">{title as string}</p><p className="mt-1 text-xs text-slate-400">{text as string}</p></Link>
          ))}
        </div>
      </section>

      <Card className="glass-panel border-cyan-400/15">
        <CardHeader><CardTitle className="flex items-center gap-2 text-white"><DatabaseZap className="text-cyan-300" /> Recent analyses</CardTitle><CardDescription className="text-slate-300">Latest production analysis jobs.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-3">Project</th><th>Status</th><th>Chain</th><th>Mode</th><th>Wallets</th><th>Created</th></tr></thead><tbody>{analyses.map((item) => { const row = item as Record<string, unknown>; const status = String(row.status ?? "-"); return <tr key={String(row.id)} className="border-t border-border/70 transition-colors hover:bg-cyan-400/[0.025]"><td className="py-4 font-medium text-white">{String(row.projectName ?? "-")}</td><td><Badge variant="outline" className={status === "completed" ? "border-emerald-400/30 text-emerald-200" : status === "failed" ? "border-rose-400/30 text-rose-200" : "border-amber-400/30 text-amber-200"}>{statusCopy(row.status)}</Badge></td><td className="text-slate-300">{String(row.chain ?? "-")}</td><td className="text-slate-300">{String(row.analysisMode ?? "-")}</td><td className="text-slate-300">{String(row.totalWallets ?? 0)}</td><td className="text-slate-400">{row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : "-"}</td></tr> })}</tbody></table>
        </CardContent>
      </Card>
    </div>
  )
}
