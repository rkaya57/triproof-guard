import Link from "next/link"
import { Braces, Code2, PackageCheck, Webhook } from "lucide-react"

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
await triProof.updateWebhook(endpoint.id, { isActive: false })`

export const metadata = {
  title: "Tri-Proof TypeScript SDK — Campaign API v2",
  description: "Publish-ready TypeScript client surface for Campaign API v2 and API Growth webhook management.",
}

export default function CampaignSdkDocsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />
      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 border-primary/30 text-primary">TypeScript SDK v0.1</Badge>
          <h1 className="text-gradient max-w-5xl text-4xl font-semibold sm:text-6xl">One client for campaign intake, decisions and webhooks.</h1>
          <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">
            The SDK source is maintained as the publish-ready `@triproof/sdk` package inside the Tri-Proof repository. Package publication is a separate release step; this page does not claim that an npm release already exists.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/docs/api/v2" className={buttonVariants()}>Campaign API v2</Link>
            <Link href="/docs/webhooks" className={buttonVariants({ variant: "outline" })}>Webhook contract</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-14 sm:px-8 md:grid-cols-3">
        <Card className="glass-panel premium-card">
          <CardHeader><PackageCheck className="text-primary" /><CardTitle>Publish-ready package</CardTitle><CardDescription>`packages/triproof-sdk` has its own package manifest, TypeScript build configuration, declarations and prepack build.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Braces className="text-primary" /><CardTitle>Campaign API v2</CardTitle><CardDescription>Create durable campaigns, run cohorts, poll analyses, export decisions and change future-run policy.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Webhook className="text-primary" /><CardTitle>Webhook management</CardTitle><CardDescription>API Growth keys can create, inspect, pause, update and delete signed webhook endpoints through `/api/v2/webhooks`.</CardDescription></CardHeader>
        </Card>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-14 sm:px-8 lg:grid-cols-2">
        <Card className="glass-panel premium-card lg:col-span-2">
          <CardHeader><Code2 className="text-primary" /><CardTitle>Campaign workflow</CardTitle><CardDescription>The same campaign ID is reused across every analysis run.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{campaignExample}</code></pre></CardContent>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>Lifecycle and policy</CardTitle><CardDescription>Policy activation is explicit, versioned and future-facing.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{operationExample}</code></pre></CardContent>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>Webhook CRUD</CardTitle><CardDescription>The signing secret is returned only when an endpoint is created.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{webhookExample}</code></pre></CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <Card className="glass-panel border-amber-400/20 bg-amber-400/[0.04]">
          <CardHeader>
            <CardTitle>Compatibility boundary</CardTitle>
            <CardDescription>
              Legacy `createAnalysis` and `getAnalysis` methods remain available for v1 one-off integrations. New campaign integrations should use Campaign API v2 methods. SDK calls do not change the underlying decision semantics or bypass API-plan and wallet-analysis billing gates.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </main>
  )
}
