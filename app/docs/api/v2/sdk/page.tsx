import Link from "next/link"
import { Activity, Braces, Code2, Network, PackageCheck, Webhook } from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const campaignExample = `const triProof = new TriProofClient({
  apiKey: process.env.TRIPROOF_API_KEY,
})

const campaign = await triProof.createCampaign({
  name: "Genesis Rewards",
  campaignType: "Airdrop",
  chain: "Base",
  riskPolicy: "balanced",
})

const run = await triProof.runCampaignAnalysis(campaign.id, {
  analysisMode: "onchain",
  wallets: [
    "0x2222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333",
  ],
})

const decisions = await triProof.getCampaignDecisionPackage(campaign.id)`

const clusterExample = `const runState = await triProof.getCampaignAnalysis(campaign.id, run.analysisId)
const cluster = runState.clusters?.[0]

if (cluster && typeof cluster === "object" && "clusterLabel" in cluster) {
  const intelligence = await triProof.getCampaignClusterIntelligence(
    campaign.id,
    run.analysisId,
    String(cluster.clusterLabel),
  )

  console.log(intelligence.support.score)
  console.log(intelligence.support.confidence)
  console.log(intelligence.archetype.primary.label)
}`

const operationExample = `await triProof.changeCampaignLifecycle(campaign.id, "paused")

await triProof.activateCampaignPolicy(campaign.id, {
  preset: "strict",
  rationale: "Higher-value reward round",
})`

const webhookExample = `const endpoint = await triProof.createWebhook({
  url: "https://yourapp.com/api/triproof-webhook",
  eventTypes: [
    "analysis.completed",
    "analysis.review_required",
    "decision_package.ready",
  ],
})

// Save endpoint.secret when the endpoint is created.
const endpointState = await triProof.getWebhook(endpoint.id)
console.log(endpointState.health)

const failed = await triProof.listWebhookDeliveries(endpoint.id, {
  status: "failed",
  limit: 25,
})

if (failed.deliveries[0]) {
  await triProof.retryWebhookDelivery(endpoint.id, failed.deliveries[0].id)
}`

export const metadata = {
  title: "Tri-Proof TypeScript SDK — Campaign API v2",
  description: "Publish-ready TypeScript client surface for Campaign API v2, cluster intelligence, webhook management and delivery observability.",
}

export default function CampaignSdkDocsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />
      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 border-primary/30 text-primary">TypeScript SDK v0.1</Badge>
          <h1 className="text-gradient max-w-5xl text-4xl font-semibold sm:text-6xl">One client for campaigns, cluster intelligence, decisions and webhooks.</h1>
          <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">
            The SDK source is maintained as the publish-ready `@triproof/sdk` package inside the Tri-Proof repository. Package publication is a separate release step; this page does not claim that an npm release already exists.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/docs/api/v2" className={buttonVariants()}>Campaign API v2</Link>
            <Link href="/docs/webhooks" className={buttonVariants({ variant: "outline" })}>Webhook contract</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-14 sm:px-8 md:grid-cols-2 xl:grid-cols-5">
        <Card className="glass-panel premium-card">
          <CardHeader><PackageCheck className="text-primary" /><CardTitle>Publish-ready package</CardTitle><CardDescription>`packages/triproof-sdk` has its own package manifest, TypeScript build configuration, declarations and prepack build.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Braces className="text-primary" /><CardTitle>Campaign API v2</CardTitle><CardDescription>Create durable campaigns, run cohorts, poll analyses, export decisions and change future-run policy.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Network className="text-primary" /><CardTitle>Cluster intelligence</CardTitle><CardDescription>Read stored grouping basis, support confidence, inferred archetype and bounded forensic previews without recomputing decisions.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Webhook className="text-primary" /><CardTitle>Webhook management</CardTitle><CardDescription>API Growth keys can create, inspect, pause, update and delete signed webhook endpoints through `/api/v2/webhooks`.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Activity className="text-primary" /><CardTitle>Delivery observability</CardTitle><CardDescription>Inspect endpoint health, page through delivery history and retry a failed persisted delivery without creating a new event.</CardDescription></CardHeader>
        </Card>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-14 sm:px-8 lg:grid-cols-2">
        <Card className="glass-panel premium-card lg:col-span-2">
          <CardHeader><Code2 className="text-primary" /><CardTitle>Campaign workflow</CardTitle><CardDescription>The same campaign ID is reused across every analysis run.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{campaignExample}</code></pre></CardContent>
        </Card>
        <Card className="glass-panel premium-card lg:col-span-2">
          <CardHeader><Network className="text-primary" /><CardTitle>Cluster Support Intelligence</CardTitle><CardDescription>The SDK resolves one cluster under its campaign and analysis run. Support confidence is evidence-strength telemetry, not a Sybil probability.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{clusterExample}</code></pre></CardContent>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>Lifecycle and policy</CardTitle><CardDescription>Policy activation is explicit, versioned and future-facing.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{operationExample}</code></pre></CardContent>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>Webhook health and retry</CardTitle><CardDescription>Manual retry increments the same delivery attempt record and cannot replay a successful delivery.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{webhookExample}</code></pre></CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <Card className="glass-panel border-amber-400/20 bg-amber-400/[0.04]">
          <CardHeader>
            <CardTitle>Compatibility boundary</CardTitle>
            <CardDescription>
              Legacy `createAnalysis` and `getAnalysis` methods remain available for v1 one-off integrations. Cluster Support Confidence and inferred archetypes are read-only forensic interpretation layers and cannot change stored membership, wallet risk, decisions or policy. Delivery health is operational telemetry only; it is not wallet risk evidence and cannot change campaign decisions. Manual retry reuses the stored payload and secure egress path and does not create a second campaign event.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </main>
  )
}
