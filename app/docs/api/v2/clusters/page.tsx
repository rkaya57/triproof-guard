import Link from "next/link"
import { Braces, Database, Network, ShieldCheck } from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

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

const sdkExample = `const intelligence = await triProof.getCampaignClusterIntelligence(
  campaignId,
  analysisId,
  clusterLabel,
)

let cursor: string | undefined

do {
  const page = await triProof.listCampaignClusterMembers(
    campaignId,
    analysisId,
    clusterLabel,
    { limit: 250, cursor },
  )

  for (const member of page.members) {
    console.log(member.walletAddress, member.storedStatus, member.teamReview)
  }

  cursor = page.pagination.nextCursor ?? undefined
} while (cursor)`

export const metadata = {
  title: "Tri-Proof API v2 — Cluster Intelligence & Members",
  description: "Read cluster support intelligence and page complete stored cluster membership without recomputing risk or decisions.",
}

export default function ClusterApiDocsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />

      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 border-cyan-400/30 text-cyan-200">Campaign API v2 · Clusters</Badge>
          <h1 className="text-gradient max-w-5xl text-4xl font-semibold sm:text-6xl">Bounded intelligence. Complete membership when you need it.</h1>
          <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">
            Cluster Intelligence returns a bounded forensic preview for fast investigation. The Members resource pages the complete stored cluster membership with an opaque cursor, without rebuilding the cluster or changing wallet decisions.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/docs/api/v2" className={buttonVariants()}>Campaign API v2</Link>
            <Link href="/docs/api/v2/sdk" className={buttonVariants({ variant: "outline" })}>TypeScript SDK</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-12 sm:px-8 md:grid-cols-2 xl:grid-cols-4">
        <Card className="glass-panel premium-card">
          <CardHeader><Network className="text-primary" /><CardTitle>Intelligence</CardTitle><CardDescription>Stored grouping, support confidence, inferred archetype and bounded provenance/timeline previews.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Database className="text-primary" /><CardTitle>Full membership</CardTitle><CardDescription>Page persisted cluster members with a 100 default and 500 maximum page size.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Braces className="text-primary" /><CardTitle>Opaque cursor</CardTitle><CardDescription>The cursor is a position token. Clients should store and return it unchanged instead of decoding it.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><ShieldCheck className="text-primary" /><CardTitle>Authorization scoped</CardTitle><CardDescription>Campaign, analysis, cluster and authenticated owner scope are verified independently of cursor position.</CardDescription></CardHeader>
        </Card>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-14 sm:px-8 lg:grid-cols-2">
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>Cluster Intelligence</CardTitle><CardDescription>Use this first for investigation context. Large arrays are intentionally bounded.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{intelligenceExample}</code></pre></CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>Cluster Members</CardTitle><CardDescription>Use `pagination.nextCursor` to enumerate every stored member without a massive response.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{membersExample}</code></pre></CardContent>
        </Card>

        <Card className="glass-panel premium-card lg:col-span-2">
          <CardHeader><CardTitle>SDK pagination</CardTitle><CardDescription>`storedStatus` remains persisted engine state. `teamReview` is returned separately as human review context.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{sdkExample}</code></pre></CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <Card className="glass-panel border-amber-400/20 bg-amber-400/[0.04]">
          <CardHeader>
            <CardTitle>Membership boundary</CardTitle>
            <CardDescription>
              The member endpoint reads the stored `WalletAnalysis.clusterId` assignment only. It never recomputes cluster membership, support confidence, wallet risk, campaign policy, or reviewer state. The cursor controls pagination position only; a cursor cannot widen the campaign, analysis, cluster, or owner scope. Database row IDs are not exposed in member objects.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </main>
  )
}
