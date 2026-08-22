import Link from "next/link"
import { ArrowLeft, Braces, GitCompareArrows, History, ShieldCheck } from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = {
  title: "Run Decision Diff — Tri-Proof API v2",
  description: "Compare persisted canonical campaign decisions between two exact analysis runs without rerunning policy, risk scoring, clustering, or evidence generation.",
}

const restExample = `curl \
  "https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses/FROM_ANALYSIS_ID/decisions/diff?compareTo=TO_ANALYSIS_ID&limit=100" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Continue only when pagination.nextCursor is non-null.
# Return the cursor unchanged.`

export default function RunDecisionDiffDocsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/docs/api/v2/decisions" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ArrowLeft data-icon="inline-start" /> Run-specific Decisions
            </Link>
            <Badge variant="secondary">Historical comparison</Badge>
          </div>
          <h1 className="mt-6 text-4xl font-semibold sm:text-5xl">Run Decision Diff</h1>
          <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
            Compare two exact analysis runs from the same campaign and see which persisted wallet decisions changed, appeared, disappeared, or retained the same execution state while audit context changed.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-5 py-12 sm:px-8 md:grid-cols-3">
        <Card className="glass-panel premium-card">
          <CardHeader><GitCompareArrows className="text-primary" /><CardTitle>Persisted transitions</CardTitle><CardDescription>State changes such as allow → review are reported only when the two stored CampaignDecision rows differ.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><History className="text-primary" /><CardTitle>Context deltas</CardTitle><CardDescription>Risk score, confidence, cluster, model and policy-version changes remain descriptive audit metadata.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><ShieldCheck className="text-primary" /><CardTitle>No recompute</CardTitle><CardDescription>The comparison does not rerun policy, risk scoring, clustering, reviewer logic or evidence generation.</CardDescription></CardHeader>
        </Card>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-5 pb-14 sm:px-8 lg:grid-cols-2">
        <Card className="glass-panel premium-card lg:col-span-2">
          <CardHeader><Braces className="text-primary" /><CardTitle>REST</CardTitle><CardDescription>`compareTo` must reference a different analysis run in the same owned campaign. Changed rows are paginated at 100 by default and 500 maximum.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{restExample}</code></pre></CardContent>
        </Card>

        <Card className="glass-panel premium-card lg:col-span-2">
          <CardHeader>
            <CardTitle>How to read the result</CardTitle>
            <CardDescription>
              `state_changed` means the persisted execution state differs between the two runs. `context_changed` means the execution state stayed the same while stored risk score, confidence, cluster, model or policy-version context changed. `added` and `removed` describe run membership only; they do not create a new eligibility or maliciousness conclusion.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="glass-panel premium-card lg:col-span-2 border-amber-400/20 bg-amber-400/[0.04]">
          <CardHeader>
            <CardTitle>Scale and audit boundary</CardTitle>
            <CardDescription>
              v1 compares up to 50,000 persisted decisions per run and returns only a bounded changed-row page. EVM identities match case-insensitively while Solana Base58 identities remain case-sensitive. The diff is an audit view over stored decisions, not a new decision engine.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </main>
  )
}
