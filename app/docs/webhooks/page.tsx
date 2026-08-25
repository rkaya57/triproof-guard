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
    "eventTypes": [
      "analysis.completed",
      "analysis.review_required",
      "decision_package.ready",
      "campaign.policy_changed",
      "campaign.lifecycle_changed"
    ],
    "description": "Production campaign webhook"
  }'`

const verifyExample = `import { createHmac, timingSafeEqual } from "node:crypto"

export function verifyTriProofWebhook(rawBody: string, headers: Headers, secret: string) {
  const timestamp = headers.get("x-triproof-timestamp") ?? ""
  const provided = (headers.get("x-triproof-signature") ?? "").replace(/^v1=/, "")
  const expected = createHmac("sha256", secret)
    .update(\`${"${timestamp}"}.${"${rawBody}"}\`)
    .digest("hex")

  if (!provided || provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}`

const campaignEvents = [
  ["analysis.completed", "The deterministic analysis is complete and canonical campaign links are available."],
  ["analysis.review_required", "Emitted only when the completed analysis contains wallets requiring human review."],
  ["decision_package.ready", "The latest read-only campaign Decision Package can be retrieved as JSON or CSV."],
  ["campaign.policy_changed", "A new explicit campaign policy version was activated for future runs."],
  ["campaign.lifecycle_changed", "The campaign moved between draft, active, paused, completed, or archived states."],
] as const

export const metadata = {
  title: "Tri-Proof Campaign Webhooks",
  description: "Signed campaign-native webhook events for analysis, Decision Packages, policy versions, lifecycle changes and Team Policy incidents.",
}

export default function WebhookDocsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />
      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 border-primary/30 text-primary">Campaign Webhooks v1</Badge>
          <h1 className="text-gradient max-w-4xl text-4xl font-semibold sm:text-6xl">Connect campaign decisions to your own backend.</h1>
          <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">
            Subscribe to signed analysis, review, Decision Package, policy-version and lifecycle events. Failed deliveries use the existing retry queue; analysis-scoped campaign events are idempotent per endpoint and analysis.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/docs/api/v2" className={`${buttonVariants()} glow-primary`}>Campaign API v2 <ArrowRight data-icon="inline-end" /></Link>
            <Link href="/dashboard/developer" className={buttonVariants({ variant: "outline" })}>Developer settings</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campaignEvents.map(([event, description]) => (
            <Card key={event} className="glass-panel premium-card">
              <CardHeader>
                <Webhook className="text-primary" />
                <CardTitle className="font-mono text-base">{event}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
          <Card className="glass-panel premium-card">
            <CardHeader><KeyRound className="text-primary" /><CardTitle>Signed payloads</CardTitle><CardDescription>Every delivery includes x-triproof-timestamp and an HMAC-SHA256 x-triproof-signature.</CardDescription></CardHeader>
          </Card>
        </div>
      </section>

      <section className="border-y border-border bg-primary/[0.03]">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <h2 className="text-2xl font-semibold">Existing Team Policy events remain supported</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            `policy.blocked` and `policy.review` remain valid subscription types. Campaign Webhooks v1 extends the event surface without removing the existing Team Policy integration.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-14 sm:px-8 lg:grid-cols-2">
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>Create webhook endpoint</CardTitle><CardDescription>Webhook endpoint management currently uses an authenticated dashboard session. The endpoint secret is shown once.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{createWebhook}</code></pre></CardContent>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>Verify the signature</CardTitle><CardDescription>Sign exactly `timestamp.rawBody` with HMAC-SHA256 and compare against the v1 signature.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{verifyExample}</code></pre></CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <Card className="glass-panel border-amber-400/20 bg-amber-400/[0.04]">
          <CardHeader>
            <CardTitle>Operational boundaries</CardTitle>
            <CardDescription>
              Webhook delivery never changes a stored wallet decision. Policy-change events describe a version that applies to future runs only. Lifecycle events describe campaign state transitions. A failed customer endpoint does not roll back a completed analysis, policy activation, or lifecycle transaction.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </main>
  )
}
