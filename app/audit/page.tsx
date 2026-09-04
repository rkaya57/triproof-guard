import Link from "next/link"
import { ShieldCheck } from "lucide-react"

import { MiniRiskAudit } from "@/components/audit/mini-risk-audit"
import { PublicTopNav } from "@/components/layout/public-top-nav"
import { requirePageUser } from "@/lib/auth/page"

export const metadata = {
  title: "Free Account Wallet Risk Audit | Tri-Proof Protocol",
  description:
    "Create or use a free Tri-Proof account, paste a Web3 campaign wallet list, and get a limited server-side Sybil risk preview before running a full saved analysis.",
}

export default async function AuditPage() {
  await requirePageUser("/audit")

  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />

      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
          <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/[0.045] p-4 text-sm leading-6 text-muted-foreground">
            <strong className="text-foreground">Free account preview.</strong> Sign-in keeps your audit tied to a protected workspace. The mini audit is limited; full Sybil Analyst runs add saved evidence, cluster investigation, policy simulation, review workflow, and exports.
          </div>
          <MiniRiskAudit />
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex max-w-3xl items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>Mini audit sends the wallet list to the server-side Tri-Proof engine for a limited preview. Full Sybil Analyst runs add persistent on-chain evidence and exportable campaign decisions.</span>
        </div>
        <div className="flex flex-wrap gap-4">
          <Link href="/dashboard/new-analysis" className="text-primary hover:underline">Run full analysis</Link>
          <Link href="/docs/trust" className="text-primary hover:underline">Trust methodology</Link>
        </div>
      </footer>
    </main>
  )
}
