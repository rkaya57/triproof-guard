import Link from "next/link"
import { Braces, Code2, FileJson2, ShieldCheck } from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const fetchExample = `curl https://triproofprotocol.com/api/v2/openapi.json \\
  -H "Accept: application/json"`

const typeGenerationExample = `npx openapi-typescript \\
  https://triproofprotocol.com/api/v2/openapi.json \\
  -o triproof-api-v2.d.ts`

const clientGenerationExample = `openapi-generator-cli generate \\
  -i https://triproofprotocol.com/api/v2/openapi.json \\
  -g typescript-fetch \\
  -o ./generated/triproof-v2`

export const metadata = {
  title: "Tri-Proof Campaign API v2 — OpenAPI",
  description: "Machine-readable OpenAPI 3.1 contract for Tri-Proof Campaign API v2, including cluster decision and evidence boundaries.",
}

export default function CampaignApiV2OpenApiDocsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />

      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 border-cyan-400/30 text-cyan-200">OpenAPI 3.1 · Campaign API v2</Badge>
          <h1 className="text-gradient max-w-5xl text-4xl font-semibold sm:text-6xl">Generate clients without losing Tri-Proof decision semantics.</h1>
          <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">
            The versioned OpenAPI contract covers Campaign API v2 resources, Bearer authentication, pagination constraints, response schemas, and machine-readable safety boundaries for cluster intelligence and evidence.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="/api/v2/openapi.json" className={`${buttonVariants()} glow-primary`}>Open raw OpenAPI JSON</a>
            <Link href="/docs/api/v2" className={buttonVariants({ variant: "outline" })}>Campaign API v2</Link>
            <Link href="/docs/api/v2/sdk" className={buttonVariants({ variant: "outline" })}>Tri-Proof SDK</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-12 sm:px-8 md:grid-cols-2 xl:grid-cols-4">
        <Card className="glass-panel premium-card">
          <CardHeader><FileJson2 className="text-primary" /><CardTitle>Versioned contract</CardTitle><CardDescription>OpenAPI 3.1 with a stable v2 contract version and production server definition.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Code2 className="text-primary" /><CardTitle>Client generation</CardTitle><CardDescription>Unique operation IDs cover campaign, analysis, cluster, policy, decision and webhook operations.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Braces className="text-primary" /><CardTitle>Typed pagination</CardTitle><CardDescription>Catalog, evidence and member limits plus opaque cursor semantics are part of the machine-readable contract.</CardDescription></CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><ShieldCheck className="text-primary" /><CardTitle>Safety extensions</CardTitle><CardDescription>`x-triproof-*` fields freeze non-recomputation and non-promotion boundaries for generated integrations.</CardDescription></CardHeader>
        </Card>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-14 sm:px-8 lg:grid-cols-3">
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>Fetch the contract</CardTitle><CardDescription>The OpenAPI document itself is public. Business API requests still require a Bearer API key.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{fetchExample}</code></pre></CardContent>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>Generate TypeScript types</CardTitle><CardDescription>Use the public contract in your preferred OpenAPI tooling.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{typeGenerationExample}</code></pre></CardContent>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>Generate a client</CardTitle><CardDescription>Generated clients inherit path, method, enum and pagination constraints from the contract.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{clientGenerationExample}</code></pre></CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <Card className="glass-panel border-amber-400/20 bg-amber-400/[0.04]">
          <CardHeader>
            <CardTitle>Machine-readable decision boundary</CardTitle>
            <CardDescription>
              The contract explicitly states that Cluster Support Confidence is not a Sybil probability, inferred archetypes are not automatic decisions, shared infrastructure is not standalone Sybil evidence, unknown shared funding alone is not conclusive, evidence pagination never re-scores stored evidence, policy changes do not recompute prior runs, and Decision Package export remains read-only.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </main>
  )
}
