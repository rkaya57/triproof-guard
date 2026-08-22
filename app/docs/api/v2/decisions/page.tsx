import Link from "next/link"
import { Archive, ArrowLeft, Braces, GitCompareArrows, History, ShieldCheck } from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = {
  title: "Run-specific Decisions — Tri-Proof API v2",
  description: "Read persisted canonical decisions for one exact Tri-Proof campaign analysis run without rerunning policy or mixing later campaign context.",
}

const restExample = `curl \
  "https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses/ANALYSIS_ID/decisions?limit=100" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Continue only when pagination.nextCursor is non-null.
# Return the cursor unchanged.`

const sdkExample = `let cursor: string | undefined

do {
  const page = await triProof.listCampaignRunDecisions(
    campaignId,
    analysisId,
    { limit: 250, cursor },
  )

  console.log(page.policySnapshot)
  console.log(page.summary)

  for (const decision of page.decisions) {
    console.log(
      decision.walletAddress,
      decision.executionState,
      decision.matchedRules,
    )
  }

  cursor = page.pagination.nextCursor ?? undefined
} while (cursor)`

export default function RunDecisionsDocsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/docs/api/v2" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ArrowLeft data-icon="inline-start" /> Campaign API v2
            </Link>
            <Link href="/docs/api/v2/decisions/diff" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <GitCompareArrows data-icon="inline-start" /> Compare runs
            </Link>
            <Badge variant="secondary">Persisted audit resource</Badge>
          </div>
          <h1 className="mt-6 text-4xl font-semibold sm:text-5xl">Run-specific Decisions</h1>
          <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
            A campaign can contain many analysis runs. This resource reads the canonical CampaignDecision rows attached to one exact run instead of rebuilding that run from today&apos;s active policy or later cross-campaign observations.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-5 py-12 sm:px-8 md:grid-cols-3">
        <Card className="glass-panel premium-card">
          <CardHeader><History className="text-primary" /><CardTitle>Exact run</CardTitle><CardDescription>`analysisId` is part of the resource identity. Decisions from another run are never mixed into the page.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Archive className="text-primary" /><CardTitle>Persisted state</CardTitle><CardDescription>Execution state, risk score, evidence, matched rules, explanation, model version and policy version come from stored CampaignDecision rows.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><ShieldCheck className="text-primary" /><CardTitle>No replay</CardTitle><CardDescription>The policy engine is not rerun. Later policy versions and later risk-memory observations do not rewrite the historical page.</CardDescription></CardHeader>
        </Card>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-5 pb-14 sm:px-8 lg:grid-cols-2">
        <Card className="glass-panel premium-card">
          <CardHeader><Braces className="text-primary" /><CardTitle>REST</CardTitle><CardDescription>100 decisions by default, 500 maximum per page.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{restExample}</code></pre></CardContent>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Braces className="text-primary" /><CardTitle>TypeScript SDK</CardTitle><CardDescription>The SDK treats the decision cursor as opaque and URL-encodes campaign and analysis IDs.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{sdkExample}</code></pre></CardContent>
        </Card>

        <Card className="glass-panel premium-card lg:col-span-2">
          <CardHeader>
            <CardTitle>Historical snapshot vs latest campaign package</CardTitle>
            <CardDescription>
              `GET /api/v2/campaigns/{'{id}'}/analyses/{'{analysisId}'}/decisions` is the historical persisted audit surface for one exact run. `GET /api/v2/campaigns/{'{id}'}/decisions` remains the latest campaign-level operational Decision Package. Use the run-specific resource for reproducible audits and the campaign-level package for current operational handoff.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </main>
  )
}
