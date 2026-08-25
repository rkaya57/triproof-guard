import Link from "next/link"
import { ArrowRight, ClipboardCheck, Code2, History, Layers3, Network, PlayCircle, RefreshCw, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PublicTopNav } from "@/components/layout/public-top-nav"

const createCampaignExample = `curl -X POST https://triproofprotocol.com/api/v2/campaigns \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "name": "Genesis Rewards",
    "campaignType": "Points Program",
    "chain": "Base",
    "riskPolicy": "balanced",
    "startsAt": "2026-09-01T00:00:00Z",
    "endsAt": "2026-09-30T23:59:59Z",
    "rewardPoolUsd": 50000,
    "campaignContracts": [
      "0x1111111111111111111111111111111111111111"
    ]
  }'`

const runJsonExample = `curl -X POST https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "analysisMode": "onchain",
    "wallets": [
      "0x2222222222222222222222222222222222222222",
      {
        "walletAddress": "0x3333333333333333333333333333333333333333",
        "campaignPoints": 120,
        "campaignEventType": "claim"
      }
    ]
  }'`

const runCsvExample = `curl -X POST https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -F "analysisMode=hybrid" \\
  -F "csvFile=@campaign-wallets.csv"`

const runCatalogExample = `curl "https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses?limit=100" \\
  -H "Authorization: Bearer YOUR_API_KEY"

# Continue with pagination.nextCursor to discover older persisted runs.
# The cursor is opaque and does not replace campaign authorization.`

const statusExample = `curl https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses/ANALYSIS_ID \\
  -H "Authorization: Bearer YOUR_API_KEY"`

const clusterExample = `curl https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses/ANALYSIS_ID/clusters/CLUSTER_LABEL \\
  -H "Authorization: Bearer YOUR_API_KEY"

# The response includes:
# - stored grouping basis
# - Cluster Support Confidence
# - inferred forensic archetype
# - bounded member / funding / graph / timeline previews
# It does not recompute membership, wallet risk, decisions or policy.`

const decisionsExample = `curl "https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/decisions?format=json" \\
  -H "Authorization: Bearer YOUR_API_KEY"

# CSV decision package:
curl "https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/decisions?format=csv" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -o decision-package.csv`

const lifecycleExample = `curl -X PATCH https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{ "lifecycle": "paused" }'

# Allowed transitions are forward-safe.
# Example: completed -> active and archived -> active are rejected.`

const policyExample = `curl -X POST https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/policy \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "preset": "strict",
    "rationale": "Increase protection before the final reward distribution."
  }'

# A new CampaignPolicy version is created.
# Stored decisions from earlier runs are not recomputed.`

export const metadata = {
  title: "Tri-Proof Campaign API v2",
  description: "Campaign-centric API v2 quick-start for durable campaigns, repeatable wallet analysis runs, paginated run history, cluster intelligence, lifecycle operations, versioned policy changes, and decision packages.",
}

const endpoints = [
  ["POST", "/api/v2/campaigns", "Create one durable campaign resource and freeze its initial risk-policy context."],
  ["GET", "/api/v2/campaigns", "List campaigns, lifecycle state, current policy, and latest analysis run."],
  ["GET", "/api/v2/campaigns/{id}", "Read one campaign with policy history and a bounded recent analysis-run preview."],
  ["PATCH", "/api/v2/campaigns/{id}", "Move the campaign through transition-safe lifecycle states."],
  ["POST", "/api/v2/campaigns/{id}/policy", "Activate a new versioned policy for future analysis runs with a required rationale."],
  ["GET", "/api/v2/campaigns/{id}/analyses", "Page the complete persisted analysis-run catalog with an opaque cursor."],
  ["POST", "/api/v2/campaigns/{id}/analyses", "Start another JSON or CSV wallet analysis under the same campaign."],
  ["GET", "/api/v2/campaigns/{id}/analyses/{analysisId}", "Read status, decision totals, top wallet evidence, clusters, and graph context."],
  ["GET", "/api/v2/campaigns/{id}/analyses/{analysisId}/clusters/{clusterLabel}", "Read ownership-scoped stored grouping, support confidence, inferred archetype and bounded forensic previews."],
  ["GET", "/api/v2/campaigns/{id}/decisions", "Retrieve the latest campaign Decision Package as JSON or CSV."],
] as const

export default function CampaignApiV2DocsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />

      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 border-cyan-400/30 text-cyan-200">Campaign API v2</Badge>
          <h1 className="text-gradient max-w-5xl text-4xl font-semibold sm:text-6xl">
            Create the campaign once. Run every wallet cohort under the same audit trail.
          </h1>
          <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">
            API v2 is campaign-native: policy, analysis history, cluster investigations and Decision Packages remain attached to one campaign instead of creating a new project for every wallet upload.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/dashboard/campaigns/new" className={`${buttonVariants()} glow-primary`}>
              Create campaign in dashboard <ArrowRight data-icon="inline-end" />
            </Link>
            <Link href="/docs/api/v2/runs" className={buttonVariants({ variant: "outline" })}>Run Catalog</Link>
            <Link href="/docs/api/v2/sdk" className={buttonVariants({ variant: "outline" })}>TypeScript SDK</Link>
            <Link href="/docs/api" className={buttonVariants({ variant: "outline" })}>API v1 + ScamGuard docs</Link>
            <Link href="/pricing" className={buttonVariants({ variant: "outline" })}>API plans</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="mb-8 max-w-3xl">
          <Badge variant="outline" className="border-primary/25 text-primary">Core workflow</Badge>
          <h2 className="mt-4 text-3xl font-semibold">Campaign → run catalog → analysis → cluster intelligence → decision package</h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            Bearer API-key requests use the existing API subscription meter. Dashboard session calls use the same v2 routes without consuming API request quota; wallet-analysis credits are still enforced by the analysis billing gate.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card className="glass-panel premium-card">
            <CardHeader><Layers3 className="text-primary" /><CardTitle>Create campaign</CardTitle><CardDescription>Store campaign identity, chain, lifecycle, reward context, contracts and initial policy.</CardDescription></CardHeader>
          </Card>
          <Card className="glass-panel premium-card">
            <CardHeader><PlayCircle className="text-primary" /><CardTitle>Run cohorts</CardTitle><CardDescription>Submit another wallet list without creating another campaign. JSON and multipart CSV are supported.</CardDescription></CardHeader>
          </Card>
          <Card className="glass-panel premium-card">
            <CardHeader><History className="text-primary" /><CardTitle>Discover history</CardTitle><CardDescription>Page persisted runs and select exact analysis IDs for decision retrieval or historical diff.</CardDescription></CardHeader>
          </Card>
          <Card className="glass-panel premium-card">
            <CardHeader><Network className="text-primary" /><CardTitle>Inspect clusters</CardTitle><CardDescription>Read support confidence and forensic context without turning interpretation into a new risk decision.</CardDescription></CardHeader>
          </Card>
          <Card className="glass-panel premium-card">
            <CardHeader><ClipboardCheck className="text-primary" /><CardTitle>Export decisions</CardTitle><CardDescription>Retrieve the latest campaign Decision Package as deterministic JSON or CSV.</CardDescription></CardHeader>
          </Card>
        </div>
      </section>

      <section className="border-y border-border bg-primary/[0.03]">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <h2 className="text-3xl font-semibold">Endpoint contract</h2>
          <div className="mt-6 grid gap-3">
            {endpoints.map(([method, path, description]) => (
              <div key={`${method}-${path}`} className="grid gap-2 rounded-xl border border-border bg-background/45 p-4 md:grid-cols-[90px_minmax(0,1fr)_1.2fr] md:items-center">
                <Badge variant="outline" className="w-fit font-mono">{method}</Badge>
                <code className="overflow-x-auto text-sm text-cyan-200">{path}</code>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="glass-panel premium-card">
            <CardHeader><Code2 className="text-primary" /><CardTitle>1. Create campaign</CardTitle><CardDescription>Risk policy is campaign-level in v2 intake and cannot silently drift between runs.</CardDescription></CardHeader>
            <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{createCampaignExample}</code></pre></CardContent>
          </Card>

          <Card className="glass-panel premium-card">
            <CardHeader><Code2 className="text-primary" /><CardTitle>2. Run JSON wallet cohort</CardTitle><CardDescription>The stored campaign chain is authoritative; clients do not choose a different chain per run.</CardDescription></CardHeader>
            <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{runJsonExample}</code></pre></CardContent>
          </Card>

          <Card className="glass-panel premium-card">
            <CardHeader><Code2 className="text-primary" /><CardTitle>3. Or upload CSV</CardTitle><CardDescription>Multipart CSV uses the same canonical parser as the dashboard analysis pipeline.</CardDescription></CardHeader>
            <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{runCsvExample}</code></pre></CardContent>
          </Card>

          <Card className="glass-panel premium-card">
            <CardHeader><History className="text-primary" /><CardTitle>4. List persisted runs</CardTitle><CardDescription>Discover older run IDs beyond the campaign detail preview without recomputing stored state.</CardDescription></CardHeader>
            <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{runCatalogExample}</code></pre></CardContent>
          </Card>

          <Card className="glass-panel premium-card">
            <CardHeader><Code2 className="text-primary" /><CardTitle>5. Poll exact run status</CardTitle><CardDescription>Returns Allow / Review / Exclude totals, evidence-aware wallet summaries and cluster links.</CardDescription></CardHeader>
            <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{statusExample}</code></pre></CardContent>
          </Card>

          <Card className="glass-panel premium-card">
            <CardHeader><Network className="text-primary" /><CardTitle>6. Read Cluster Intelligence</CardTitle><CardDescription>Cluster Support Confidence is an explainable evidence-strength indicator for an already-stored grouping, not a Sybil probability or automatic action.</CardDescription></CardHeader>
            <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{clusterExample}</code></pre></CardContent>
          </Card>

          <Card className="glass-panel premium-card">
            <CardHeader><RefreshCw className="text-primary" /><CardTitle>7. Change lifecycle</CardTitle><CardDescription>Lifecycle transitions are constrained; completed and archived campaigns cannot be silently reopened.</CardDescription></CardHeader>
            <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{lifecycleExample}</code></pre></CardContent>
          </Card>

          <Card className="glass-panel premium-card">
            <CardHeader><ShieldCheck className="text-primary" /><CardTitle>8. Activate a policy version</CardTitle><CardDescription>A rationale is required and the new version applies only to future campaign runs.</CardDescription></CardHeader>
            <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{policyExample}</code></pre></CardContent>
          </Card>

          <Card className="glass-panel premium-card lg:col-span-2">
            <CardHeader><ClipboardCheck className="text-primary" /><CardTitle>9. Retrieve Decision Package</CardTitle><CardDescription>The package reuses the same read-only customer decision semantics as the dashboard; API v2 does not recompute wallet decisions.</CardDescription></CardHeader>
            <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{decisionsExample}</code></pre></CardContent>
          </Card>
        </div>

        <Card className="mt-6 glass-panel border-amber-400/20 bg-amber-400/[0.04]">
          <CardHeader>
            <CardTitle>Decision, run, cluster and policy boundaries</CardTitle>
            <CardDescription>
              Analysis Run Catalog reads persisted run summaries and does not rerun analysis or reinterpret historical decisions. Cluster Support Confidence and inferred archetypes are read-only forensic interpretation and cannot change stored cluster membership, wallet risk, wallet decisions, reviewer state or campaign policy. A campaign run cannot silently change its stored policy preset. Policy activation creates a new CampaignPolicy version and never recomputes prior run decisions. Paused, completed, and archived campaigns reject new runs. Completed campaigns can only be archived, while archived campaigns cannot be reopened by Campaign Operations v1. Provider failures remain unresolved evidence/Gray Zone context rather than becoming malicious risk. Decision Package export is read-only.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </main>
  )
}