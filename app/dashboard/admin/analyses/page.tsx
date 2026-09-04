import Link from "next/link"
import { Activity, Layers3 } from "lucide-react"

import { AdminWorkspaceHeader } from "@/components/admin/admin-workspace-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getRecentAnalyses } from "@/lib/admin/health"
import { getAdminUser } from "@/lib/auth/admin"

function statusTone(status: string) {
  const value = status.toLowerCase()
  if (value.includes("complete")) return "border-emerald-300/20 bg-emerald-300/[0.04] text-emerald-200"
  if (value.includes("fail")) return "border-rose-300/20 bg-rose-300/[0.04] text-rose-200"
  if (value.includes("process") || value.includes("queue") || value.includes("pending")) return "border-amber-300/20 bg-amber-300/[0.04] text-amber-200"
  return "border-white/[0.08] text-slate-300"
}

export default async function Page() {
  const admin = await getAdminUser()
  if (!admin) return <Card className="glass-panel"><CardHeader><CardTitle>Admin login required</CardTitle></CardHeader><CardContent><Link href="/login" className={buttonVariants()}>Login</Link></CardContent></Card>

  const analyses = await getRecentAnalyses()
  const processingCount = analyses.filter((item) => {
    const row = item as Record<string, unknown>
    const status = String(row.status ?? "").toLowerCase()
    return status.includes("process") || status.includes("queue") || status.includes("pending")
  }).length

  return (
    <div className="grid gap-6">
      <AdminWorkspaceHeader
        icon={Layers3}
        eyebrow="Analysis operations"
        title="Recent analysis jobs"
        description="Inspect campaign analysis status, wallet volume and the linked report surface without leaving the operations workspace."
        tone="cyan"
        meta={
          <>
            <span className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs text-slate-300">{analyses.length} recent jobs</span>
            <span className="rounded-xl border border-amber-300/12 bg-amber-300/[0.025] px-3 py-2 text-xs text-amber-200">{processingCount} active / queued</span>
          </>
        }
        actions={<Link href="/dashboard/new-analysis" className={buttonVariants({ size: "sm" })}>New analysis</Link>}
      />

      <Card className="glass-panel premium-card overflow-hidden">
        <CardHeader className="border-b border-white/[0.055] bg-white/[0.012]">
          <div className="flex items-center gap-2"><Activity className="size-4 text-primary" /><CardTitle className="text-base">Analysis ledger</CardTitle></div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="border-b border-border bg-muted/25 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              <tr><th className="px-6 py-3">Project</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Chain</th><th className="px-4 py-3">Mode</th><th className="px-4 py-3">Wallets</th><th className="px-6 py-3 text-right">Report</th></tr>
            </thead>
            <tbody>
              {analyses.map((item) => {
                const row = item as Record<string, unknown>
                const status = String(row.status ?? "-")
                return (
                  <tr key={String(row.id)} className="border-b border-border/70 transition hover:bg-primary/[0.025]">
                    <td className="px-6 py-4 font-medium text-white">{String(row.projectName ?? "-")}</td>
                    <td className="px-4 py-4"><Badge variant="outline" className={statusTone(status)}>{status}</Badge></td>
                    <td className="px-4 py-4 text-muted-foreground">{String(row.chain ?? "-")}</td>
                    <td className="px-4 py-4 text-muted-foreground">{String(row.analysisMode ?? "-")}</td>
                    <td className="px-4 py-4 tabular-nums text-slate-300">{Number(row.totalWallets ?? 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right"><Link href={`/dashboard/analysis/${String(row.id)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Open</Link></td>
                  </tr>
                )
              })}
              {!analyses.length && <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">No recent analysis jobs.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
