import Link from "next/link"

import { getRecentAnalyses } from "@/lib/admin/health"
import { getAdminUser } from "@/lib/auth/admin"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"

export default async function Page() {
  const admin = await getAdminUser()
  if (!admin) return <Card className="glass-panel"><CardHeader><CardTitle>Admin login required</CardTitle></CardHeader><CardContent><Link href="/login" className={buttonVariants()}>Login</Link></CardContent></Card>

  const analyses = await getRecentAnalyses()

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Analysis Operations</CardTitle>
        <CardDescription>Recent campaign analysis jobs and direct report links.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground"><tr><th className="py-2">Project</th><th>Status</th><th>Chain</th><th>Mode</th><th>Wallets</th><th></th></tr></thead>
          <tbody>
            {analyses.map((item) => {
              const row = item as Record<string, unknown>
              return (
                <tr key={String(row.id)} className="border-t border-border">
                  <td className="py-2">{String(row.projectName ?? "-")}</td>
                  <td>{String(row.status ?? "-")}</td>
                  <td>{String(row.chain ?? "-")}</td>
                  <td>{String(row.analysisMode ?? "-")}</td>
                  <td>{String(row.totalWallets ?? 0)}</td>
                  <td><Link href={`/dashboard/analysis/${String(row.id)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Open</Link></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
