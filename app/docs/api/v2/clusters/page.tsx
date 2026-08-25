import Link from "next/link"
import { Braces, Database, ListTree, Network, ShieldCheck } from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const catalogExample = `curl \
  "https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses/ANALYSIS_ID/clusters?limit=100" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Each row contains links.intelligence and links.members.
# Continue with pagination.nextCursor when hasMore is true.`

const intelligenceExample = `curl \
  https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses/ANALYSIS_ID/clusters/CLUSTER_LABEL \
  -H "Authorization: Bearer YOUR_API_KEY"`

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

    console.log(intelligence.support.confidence)
  }

  clusterCursor = catalog.pagination.nextCursor ?? undefined
} while (clusterCursor)`

export const metadata = {
  title: "Tri-Proof API v2 — Cluster Catalog, Intelligence & Members",
  description: "Page stored clusters, read support intelligence, and enumerate complete membership without recomputing risk or decisions.",
}

export default function ClusterApiDocsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />

      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 border-cyan-400/30 text-cyan-200">Campaign API v2 · Clusters</Badge>
          <h1 className="text-gradient max-w-5xl text-4xl font-semibold sm:text-6xl">Catalog every cluster. Investigate only what you need.</h1>
          <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">
            Cluster Catalog pages lightweight persisted cluster summaries. Cluster Intelligence adds bounded forensic context and support confidence. Cluster Members provides complete stored membership through a separate opaque cursor.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/docs/api/v2" className={buttonVariants()}>Campaign API v2</Link>
            <Link href="/docs/api/v2/sdk" className={buttonVariants({ variant: "outline" })}>TypeScript SDK</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-12 sm:px-8 md:grid-cols-2 xl:grid-cols-5">
        <Card className="glass-panel premium-card">
          <CardHeader><ListTree className="text-primary" /><CardTitle>Catalog</CardTitle><CardDescription>Enumerate every persisted cluster without batch-recomputing forensic intelligence.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Network className="text-primary" /><CardTitle>Intelligence</CardTitle><CardDescription>Stored grouping, support confidence, inferred archetype and bounded provenance/timeline previews.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Database className="text-primary" /><CardTitle>Full membership</CardTitle><CardDescription>Page persisted cluster members with a 100 default and 500 maximum page size.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Braces className="text-primary" /><CardTitle>Opaque cursors</CardTitle><CardDescription>Catalog and member cursors are scope-specific position tokens. Store and return them unchanged.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><ShieldCheck className="text-primary" /><CardTitle>Authorization scoped</CardTitle><CardDescription>Campaign, analysis, cluster and authenticated owner scope are verified independently of cursor position.</CardDescription></CardHeader>
        </Card>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-14 sm:px-8 lg:grid-cols-2">
        <Card className="glass-panel premium-card lg:col-span-2">
          <CardHeader><CardTitle>1. Cluster Catalog</CardTitle><CardDescription>Use the lightweight catalog to enumerate all persisted clusters. Support confidence and archetypes are intentionally deferred to detail calls.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{catalogExample}</code></pre></CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>2. Cluster Intelligence</CardTitle><CardDescription>Open only the cluster that needs forensic context. Large arrays are intentionally bounded.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{intelligenceExample}</code></pre></CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>3. Cluster Members</CardTitle><CardDescription>Use `pagination.nextCursor` to enumerate every stored member without a massive response.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{membersExample}</code></pre></CardContent>
        </Card>

        <Card className="glass-panel premium-card lg:col-span-2">
          <CardHeader><CardTitle>SDK end-to-end pagination</CardTitle><CardDescription>`storedStatus` remains persisted engine state. `teamReview` remains separate human context.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{sdkExample}</code></pre></CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <Card className="glass-panel border-amber-400/20 bg-amber-400/[0.04]">
          <CardHeader>
            <CardTitle>Cluster resource boundaries</CardTitle>
            <CardDescription>
              Catalog lists persisted `Cluster` rows and intentionally does not batch-recompute support confidence or archetypes. Intelligence remains read-only forensic interpretation. Members reads the stored `WalletAnalysis.clusterId` assignment only. None of these endpoints recompute cluster membership, wallet risk, campaign policy, or reviewer state. Scope-specific cursors control pagination position only and cannot widen campaign, analysis, cluster, or owner authorization.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </main>
  )
}
