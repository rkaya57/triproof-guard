import Link from "next/link"
import { ArrowLeft, Braces, GitCompareArrows, History, ListOrdered, ShieldCheck } from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = {
  title: "Analysis Run Catalog — Tri-Proof API v2",
  description: "Page persisted analysis-run history for a campaign and select exact runs for decision retrieval and historical comparison.",
}

const restExample = `curl \
  "https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses?limit=100" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Continue only when pagination.nextCursor is non-null.
# Return the cursor unchanged.`

const sdkExample = `const page = await client.listCampaignAnalysisRuns(
  campaignId,
  { limit: 100, cursor },
)

for (const run of page.runs) {
  console.log(run.id, run.status, run.decisions)
}`

export default function AnalysisRunCatalogDocsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/docs/api/v2" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ArrowLeft data-icon="inline-start" /> Campaign API v2
            </Link>
            <Badge variant="secondary">Persisted run history</Badge>
          </div>
          <h1 className="mt-6 text-4xl font-semibold sm:text-5xl">Analysis Run Catalog</h1>
          <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
            Discover every persisted analysis run under one campaign instead of relying on the bounded recent-run preview returned by campaign detail. Use the returned analysis IDs to inspect exact-run decisions or compare two historical runs.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-5 py-12 sm:px-8 md:grid-cols-3">
        <Card className="glass-panel premium-card">
          <CardHeader><ListOrdered className="text-primary" /><CardTitle>Complete discovery</CardTitle><CardDescription>Page beyond the campaign detail preview with a 100 default and 500 maximum page size.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><History className="text-primary" /><CardTitle>Stored summaries</CardTitle><CardDescription>Status, wallet totals, decision totals, risk summary and cluster count are read from persisted run metadata.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><ShieldCheck className="text-primary" /><CardTitle>No recompute</CardTitle><CardDescription>Listing runs never reruns analysis, policy, risk scoring, clustering, or evidence generation.</CardDescription></CardHeader>
        </Card>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-5 pb-14 sm:px-8 lg:grid-cols-2">
        <Card className="glass-panel premium-card">
          <CardHeader><Braces className="text-primary" /><CardTitle>REST</CardTitle><CardDescription>The cursor is opaque and controls ordering position only. Campaign ownership is verified independently on every request.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{restExample}</code></pre></CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader><Braces className="text-primary" /><CardTitle>TypeScript SDK</CardTitle><CardDescription>`listCampaignAnalysisRuns()` exposes the same bounded run-history resource through `@triproof/sdk`.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{sdkExample}</code></pre></CardContent>
        </Card>

        <Card className="glass-panel premium-card lg:col-span-2">
          <CardHeader>
            <GitCompareArrows className="text-primary" />
            <CardTitle>Recommended historical workflow</CardTitle>
            <CardDescription>
              Run Catalog → choose an `analysisId` → read `/decisions` for its persisted wallet decisions → choose a second `analysisId` → use `/decisions/diff?compareTo=...` to inspect persisted transitions. None of these read paths rewrites historical state.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </main>
  )
}
