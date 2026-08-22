import Link from "next/link"
import { Braces, Database, FileSearch, ListTree, Network, ShieldCheck } from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const catalogExample = `curl \
  "https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses/ANALYSIS_ID/clusters?limit=100" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Each row links to Intelligence and Members.
# Continue with pagination.nextCursor when hasMore is true.`

const intelligenceExample = `curl \
  https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses/ANALYSIS_ID/clusters/CLUSTER_LABEL \
  -H "Authorization: Bearer YOUR_API_KEY"`

const evidenceExample = `# Canonical funding evidence
curl \
  "https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses/ANALYSIS_ID/clusters/CLUSTER_LABEL/evidence?lane=funding&limit=100" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Stored graph evidence
curl \
  "https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses/ANALYSIS_ID/clusters/CLUSTER_LABEL/evidence?lane=graph&limit=100" \
  -H "Authorization: Bearer YOUR_API_KEY"

# A cursor belongs to one lane only. Pass pagination.nextCursor back unchanged.`

const membersExample = `curl \
  "https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses/ANALYSIS_ID/clusters/CLUSTER_LABEL/members?limit=250" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Continue only when pagination.nextCursor is non-null:
curl \
  "https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses/ANALYSIS_ID/clusters/CLUSTER_LABEL/members?limit=250&cursor=OPAQUE_CURSOR" \
  -H "Authorization: Bearer YOUR_API_KEY"`

const sdkExample = `let clusterCursor: string | undefined

do {
  const catalog = await triProof.listCampaignClusters(
    campaignId,
    analysisId,
    { limit: 100, cursor: clusterCursor },
  )

  for (const cluster of catalog.clusters) {
    const intelligence = await triProof.getCampaignClusterIntelligence(
      campaignId,
      analysisId,
      cluster.clusterLabel,
    )

    let evidenceCursor: string | undefined
    do {
      const evidencePage = await triProof.listCampaignClusterEvidence(
        campaignId,
        analysisId,
        cluster.clusterLabel,
        { lane: "funding", limit: 100, cursor: evidenceCursor },
      )

      for (const item of evidencePage.evidence) {
        console.log(item.kind, item.riskBearing)
      }

      evidenceCursor = evidencePage.pagination.nextCursor ?? undefined
    } while (evidenceCursor)

    let memberCursor: string | undefined
    do {
      const page = await triProof.listCampaignClusterMembers(
        campaignId,
        analysisId,
        cluster.clusterLabel,
        { limit: 250, cursor: memberCursor },
      )

      for (const member of page.members) {
        console.log(member.walletAddress, member.storedStatus, member.teamReview)
      }

      memberCursor = page.pagination.nextCursor ?? undefined
    } while (memberCursor)

    const caseBrief = await triProof.exportCampaignClusterCase(
      campaignId,
      analysisId,
      cluster.clusterLabel,
      "markdown",
    )

    console.log(intelligence.support.confidence, caseBrief.length)
  }

  clusterCursor = catalog.pagination.nextCursor ?? undefined
} while (clusterCursor)`

export const metadata = {
  title: "Tri-Proof API v2 — Cluster Catalog, Intelligence, Evidence, Members & Export",
  description: "Page stored clusters, inspect persisted forensic evidence, enumerate complete membership, and export read-only investigation cases without recomputing risk or decisions.",
}

export default function ClusterApiDocsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />

      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 border-cyan-400/30 text-cyan-200">Campaign API v2 · Clusters</Badge>
          <h1 className="text-gradient max-w-5xl text-4xl font-semibold sm:text-6xl">Catalog every cluster. Pull full evidence only when you need it.</h1>
          <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">
            Cluster Catalog pages lightweight persisted summaries. Cluster Intelligence adds bounded forensic interpretation. Cluster Evidence pages stored funding or graph evidence without re-scoring it. Cluster Members provides complete stored membership through a separate opaque cursor. Cluster Case Export packages the same stored investigation as JSON, CSV, or a read-only Markdown brief.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/docs/api/v2" className={buttonVariants()}>Campaign API v2</Link>
            <Link href="/docs/api/v2/clusters/export" className={buttonVariants({ variant: "outline" })}>Case Export</Link>
            <Link href="/docs/api/v2/sdk" className={buttonVariants({ variant: "outline" })}>TypeScript SDK</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-12 sm:px-8 md:grid-cols-2 xl:grid-cols-6">
        <Card className="glass-panel premium-card">
          <CardHeader><ListTree className="text-primary" /><CardTitle>Catalog</CardTitle><CardDescription>Enumerate persisted clusters without batch-recomputing forensic intelligence.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Network className="text-primary" /><CardTitle>Intelligence</CardTitle><CardDescription>Stored grouping, support confidence, inferred archetype and bounded previews.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><FileSearch className="text-primary" /><CardTitle>Evidence</CardTitle><CardDescription>Page canonical funding or stored graph evidence while preserving persisted risk semantics.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Database className="text-primary" /><CardTitle>Members</CardTitle><CardDescription>Page complete stored membership with a 100 default and 500 maximum page size.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Braces className="text-primary" /><CardTitle>Opaque cursors</CardTitle><CardDescription>Catalog, member, funding-evidence and graph-evidence cursors are scope-specific position tokens.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><ShieldCheck className="text-primary" /><CardTitle>Authorization</CardTitle><CardDescription>Campaign, analysis, cluster and owner scope are verified independently of every cursor and export request.</CardDescription></CardHeader>
        </Card>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-14 sm:px-8 lg:grid-cols-2">
        <Card className="glass-panel premium-card lg:col-span-2">
          <CardHeader><CardTitle>1. Cluster Catalog</CardTitle><CardDescription>Enumerate all persisted clusters. Support confidence and archetypes are intentionally deferred to detail calls.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{catalogExample}</code></pre></CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>2. Cluster Intelligence</CardTitle><CardDescription>Open only the cluster that needs forensic interpretation. Large arrays remain bounded previews.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{intelligenceExample}</code></pre></CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>3. Cluster Evidence</CardTitle><CardDescription>Use `lane=funding` or `lane=graph`. `riskBearing` is copied from stored evidence and never promoted by the API.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{evidenceExample}</code></pre></CardContent>
        </Card>

        <Card className="glass-panel premium-card lg:col-span-2">
          <CardHeader><CardTitle>4. Cluster Members</CardTitle><CardDescription>Use `pagination.nextCursor` to enumerate every stored member without a massive response.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{membersExample}</code></pre></CardContent>
        </Card>

        <Card className="glass-panel premium-card lg:col-span-2">
          <CardHeader><CardTitle>SDK end-to-end cluster workflow</CardTitle><CardDescription>Inspect bounded or paginated resources first, then call `exportCampaignClusterCase()` for the final read-only handoff package.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{sdkExample}</code></pre></CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <Card className="glass-panel border-amber-400/20 bg-amber-400/[0.04]">
          <CardHeader>
            <CardTitle>Cluster resource boundaries</CardTitle>
            <CardDescription>
              Catalog lists persisted `Cluster` rows. Intelligence remains read-only forensic interpretation. Evidence pages stored canonical funding relationships or stored graph edges and preserves their existing `riskBearing` state. Members reads the stored `WalletAnalysis.clusterId` assignment only. Case Export packages these already-stored investigation surfaces and carries a `read-only-no-recompute` boundary. None of these resources recompute membership, wallet risk, campaign policy, reviewer state, or a common-control conclusion. Evidence scans are bounded per request and lane-specific cursors control scan position only.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </main>
  )
}
