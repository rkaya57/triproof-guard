import Link from "next/link"
import { ArrowLeft, Download, FileJson2, FileSpreadsheet, FileText, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PublicTopNav } from "@/components/layout/public-top-nav"

export const metadata = {
  title: "Cluster Case Export — Tri-Proof API v2",
  description: "Export one stored Tri-Proof cluster investigation as JSON, CSV, or a read-only Markdown case brief.",
}

const curlExample = `# JSON investigation package
curl "https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses/ANALYSIS_ID/clusters/CLUSTER_LABEL/export?format=json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -o cluster-investigation.json

# CSV wallet evidence matrix
curl "https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses/ANALYSIS_ID/clusters/CLUSTER_LABEL/export?format=csv" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -o cluster-investigation.csv

# Markdown analyst case brief
curl "https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses/ANALYSIS_ID/clusters/CLUSTER_LABEL/export?format=markdown" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -o cluster-case-brief.md`

const sdkExample = `import { TriProofClient } from "@triproof/sdk"

const client = new TriProofClient({ apiKey: process.env.TRIPROOF_API_KEY! })

const markdown = await client.exportCampaignClusterCase(
  campaignId,
  analysisId,
  clusterLabel,
  "markdown",
)

// The SDK returns export bodies as text for every format.
// Parse JSON only if your integration needs an object.
const jsonText = await client.exportCampaignClusterCase(
  campaignId,
  analysisId,
  clusterLabel,
  "json",
)`

export default function ClusterCaseExportDocsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/docs/api/v2/clusters" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ArrowLeft data-icon="inline-start" /> Cluster API
            </Link>
            <Badge variant="secondary">Campaign API v2</Badge>
          </div>
          <h1 className="mt-6 text-4xl font-semibold sm:text-5xl">Cluster Case Export</h1>
          <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
            Package one already-stored cluster investigation for downstream review, audit, or customer handoff without recomputing membership, risk, decisions, policy, reviewer state, or evidence semantics.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="glass-panel premium-card">
            <CardHeader><FileJson2 className="text-primary" /><CardTitle>JSON</CardTitle><CardDescription>Full deterministic investigation package with stored cluster state, provenance, timeline context, latest cluster review, and explicit export boundaries.</CardDescription></CardHeader>
          </Card>
          <Card className="glass-panel premium-card">
            <CardHeader><FileSpreadsheet className="text-primary" /><CardTitle>CSV</CardTitle><CardDescription>Wallet-level investigation matrix. Free-text cells retain the existing spreadsheet-formula injection protection.</CardDescription></CardHeader>
          </Card>
          <Card className="glass-panel premium-card">
            <CardHeader><FileText className="text-primary" /><CardTitle>Markdown</CardTitle><CardDescription>Read-only analyst case brief combining stored cluster state, latest human cluster review, matching policy context when available, evidence summary, next actions, and limitations.</CardDescription></CardHeader>
          </Card>
        </div>

        <Card className="mt-6 glass-panel border-amber-400/20 bg-amber-400/[0.04]">
          <CardHeader>
            <ShieldCheck className="text-amber-300" />
            <CardTitle>Decision boundary</CardTitle>
            <CardDescription>
              Every successful export carries `X-Tri-Proof-Decision-Boundary: read-only-no-recompute`. Export generation cannot change cluster membership, wallet risk, stored wallet decisions, policy outcomes, reviewer state, or whether existing funding/graph evidence is risk-bearing or neutralized.
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <Card className="glass-panel premium-card">
            <CardHeader><Download className="text-primary" /><CardTitle>REST</CardTitle><CardDescription>All three formats use the same ownership-scoped GET resource.</CardDescription></CardHeader>
            <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{curlExample}</code></pre></CardContent>
          </Card>
          <Card className="glass-panel premium-card">
            <CardHeader><Download className="text-primary" /><CardTitle>TypeScript SDK</CardTitle><CardDescription>The SDK URL-encodes campaign, analysis, and cluster identifiers and returns the attachment body as text.</CardDescription></CardHeader>
            <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{sdkExample}</code></pre></CardContent>
          </Card>
        </div>

        <Card className="mt-6 glass-panel premium-card">
          <CardHeader>
            <CardTitle>Recommended resource flow</CardTitle>
            <CardDescription>
              Use Cluster Catalog to discover stored groups, Cluster Intelligence to understand grouping support, Evidence and Members pagination for complete forensic inspection, then Case Export for an auditable handoff package.
            </CardDescription>
          </CardHeader>
          <CardContent className="font-mono text-sm text-cyan-200">
            Catalog → Intelligence → Evidence → Members → Case Export
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
