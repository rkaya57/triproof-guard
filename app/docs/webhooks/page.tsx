import Link from "next/link"
import { ArrowRight, KeyRound, Webhook } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const createWebhook = `curl -X POST https://triproofprotocol.com/api/webhooks \\
  -H "Content-Type: application/json" \\
  -b "dashboard_session_cookie" \\
  -d '{
    "url": "https://yourapp.com/api/triproof-webhook",
    "eventTypes": ["analysis.completed", "policy.blocked", "policy.review"],
    "description": "Production campaign webhook"
  }'`

const sdkExample = `import { TriProofClient } from "@/lib/sdk/triproof-client"

const client = new TriProofClient({ apiKey: process.env.TRIPROOF_API_KEY! })

const created = await client.createAnalysis({
  chain: "Solana",
  projectName: "Partner Campaign Audit",
  riskPolicy: "balanced",
  wallets: ["Ch8kCo2FW4HXQMTm2wpbLeaVZJxXa4Rg8S4KVXUxcdVm"]
})

const status = await client.getAnalysis(created.analysisId)`

export const metadata = {
  title: "Tri-Proof Webhooks and SDK",
  description: "V2.3 webhook and TypeScript SDK documentation for Tri-Proof Guard.",
}

export default function WebhookDocsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />
      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 border-primary/30 text-primary">V2.3 Webhook / SDK</Badge>
          <h1 className="text-gradient max-w-4xl text-4xl font-semibold sm:text-6xl">Connect Tri-Proof to your campaign workflow.</h1>
          <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">Register webhook endpoints, receive signed analysis events and real-time Team Policy incidents, then use the TypeScript SDK helper for API integrations.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/docs/api" className={`${buttonVariants()} glow-primary`}>API docs <ArrowRight data-icon="inline-end" /></Link>
            <Link href="/api/v1" className={buttonVariants({ variant: "outline" })}>Open API index</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-14 sm:px-8 lg:grid-cols-4">
        <Card className="glass-panel premium-card"><CardHeader><Webhook className="text-primary" /><CardTitle>analysis.completed</CardTitle><CardDescription>Sent after a batch analysis finishes and exports are ready.</CardDescription></CardHeader></Card>
        <Card className="glass-panel premium-card"><CardHeader><Webhook className="text-rose-300" /><CardTitle>policy.blocked</CardTitle><CardDescription>Sent when an active team rule stops a Chrome, API, or Guardian action.</CardDescription></CardHeader></Card>
        <Card className="glass-panel premium-card"><CardHeader><Webhook className="text-amber-200" /><CardTitle>policy.review</CardTitle><CardDescription>Sent when an active team rule requires an explicit human review.</CardDescription></CardHeader></Card>
        <Card className="glass-panel premium-card"><CardHeader><KeyRound className="text-primary" /><CardTitle>Signed payloads</CardTitle><CardDescription>Verify x-triproof-signature using the endpoint secret.</CardDescription></CardHeader></Card>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-16 sm:px-8 lg:grid-cols-2">
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>Create webhook endpoint</CardTitle><CardDescription>Dashboard session required for endpoint management.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{createWebhook}</code></pre></CardContent>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>TypeScript SDK example</CardTitle><CardDescription>Create analysis and poll status from code.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{sdkExample}</code></pre></CardContent>
        </Card>
      </section>
    </main>
  )
}
