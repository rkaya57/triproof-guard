import Link from "next/link"
import {
  ArrowRight,
  Braces,
  Code2,
  FileJson2,
  KeyRound,
  Layers3,
  Webhook,
} from "lucide-react"

import { DocsCodeBlock } from "@/components/docs/docs-code-block"
import {
  DocsCallout,
  DocsNextLinks,
  DocsPageIntro,
  ProductDocsShell,
} from "@/components/docs/product-docs-shell"
import { buttonVariants } from "@/components/ui/button"

export const metadata = {
  title: "Integration Guide | Tri-Proof Documentation",
  description:
    "Choose between Tri-Proof Dashboard, Campaign API v2, OpenAPI, TypeScript SDK, and signed webhooks for your Web3 campaign and security integration.",
}

const toc = [
  { id: "choose", label: "Choose an integration" },
  { id: "auth", label: "Authentication" },
  { id: "rest", label: "REST API v2" },
  { id: "openapi", label: "OpenAPI" },
  { id: "sdk", label: "TypeScript SDK" },
  { id: "webhooks", label: "Webhooks" },
  { id: "architecture", label: "Recommended architecture" },
]

const listRuns = `curl "https://triproofprotocol.com/api/v2/campaigns/CAMPAIGN_ID/analyses?limit=100" \\
  -H "Authorization: Bearer $TRIPROOF_API_KEY"`

const openApi = `curl https://triproofprotocol.com/api/v2/openapi.json \\
  -o triproof-openapi.json

# Example: generate TypeScript types
npx openapi-typescript triproof-openapi.json -o triproof-api.d.ts`

const sdkExample = `import { TriProofClient } from "@triproof/sdk"

const client = new TriProofClient({
  apiKey: process.env.TRIPROOF_API_KEY!,
})

const runs = await client.listCampaignAnalysisRuns("CAMPAIGN_ID", {
  limit: 100,
})`

const webhookVerify = `// HMAC-SHA256 verification contract
// signed input: timestamp + "." + rawRequestBody
// header: x-triproof-signature: v1=<hex digest>
// header: x-triproof-timestamp: <timestamp>

const signedPayload = timestamp + "." + rawBody`

export default function IntegrationsDocsPage() {
  return (
    <ProductDocsShell currentPath="/docs/integrations" toc={toc}>
      <DocsPageIntro
        eyebrow="Integration guide"
        title="Choose the lightest integration that solves your workflow"
        description="You can start a pilot with the dashboard and a CSV. When the workflow becomes repeatable, move the same campaign semantics into API v2, generated OpenAPI clients, the TypeScript SDK package, and signed webhooks."
      >
        <Link href="/docs/api/v2" className={buttonVariants()}>
          Campaign API v2
        </Link>
        <Link href="/docs/api/v2/openapi" className={buttonVariants({ variant: "outline" })}>
          OpenAPI contract
        </Link>
      </DocsPageIntro>

      <section id="choose" className="scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">Choose an integration by operational maturity</h2>
        <div className="mt-6 overflow-hidden rounded-xl border border-border/75">
          <div className="grid grid-cols-[0.8fr_1fr_1.4fr] border-b border-border/70 bg-muted/30 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <div>Option</div>
            <div>Best for</div>
            <div>Use it when</div>
          </div>
          {[
            ["Dashboard", "Pilot / analyst team", "A person can upload cohorts, investigate Review cases, and export decisions manually."],
            ["REST API v2", "Backend automation", "Your campaign platform needs repeatable campaign creation, runs, history, decisions, clusters, policy, or webhooks."],
            ["OpenAPI", "Generated clients", "Your team wants a machine-readable contract and language-specific client generation."],
            ["TypeScript SDK", "TypeScript products", "You want typed helpers around campaign and webhook API workflows."],
            ["Webhooks", "Event-driven systems", "You want Tri-Proof to notify your backend after analysis or campaign-operation events."],
          ].map(([option, best, use]) => (
            <div key={option} className="grid grid-cols-[0.8fr_1fr_1.4fr] gap-3 border-b border-border/60 px-4 py-4 text-xs last:border-b-0">
              <div className="font-medium text-foreground">{option}</div>
              <div className="text-muted-foreground">{best}</div>
              <div className="leading-5 text-muted-foreground">{use}</div>
            </div>
          ))}
        </div>
        <DocsCallout title="Pilot recommendation" tone="success">
          Do not require an integration for the first validation pilot. A 50–100 wallet CSV is enough to prove the workflow, inspect the investigation output, and decide whether automation is worth the engineering effort.
        </DocsCallout>
      </section>

      <section id="auth" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <KeyRound className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">Authentication belongs on your backend</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          API v2 accepts authenticated Bearer requests. Keep API keys in server-side environment variables or your secret manager. Do not expose a private API key in public browser JavaScript, static HTML, client-side bundles, or screenshots.
        </p>
        <div className="mt-5 rounded-xl border border-border/75 bg-card/25 p-5 font-mono text-xs text-muted-foreground">
          Authorization: Bearer $TRIPROOF_API_KEY
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Dashboard session calls can use the same campaign-native routes without consuming API request quota, while wallet-analysis billing remains enforced independently by the analysis credit gate.
        </p>
      </section>

      <section id="rest" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <Code2 className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">REST API v2: campaign-native automation</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          API v2 is the primary campaign integration surface. Create one durable campaign, submit repeated JSON or CSV cohorts, poll exact runs, page historical runs, inspect clusters and evidence, retrieve persisted decisions, compare runs, activate future policy versions, and manage webhooks.
        </p>
        <div className="mt-5">
          <DocsCodeBlock label="List analysis runs" language="bash" code={listRuns} />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            ["Campaign resources", "Create/list/read campaigns and manage lifecycle context."],
            ["Analysis resources", "Create runs, poll exact status, and discover full run history with opaque cursors."],
            ["Cluster resources", "Page the catalog, intelligence, evidence, members, and case exports."],
            ["Decision resources", "Read latest operational packages, exact-run persisted decisions, and run-to-run decision diff."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-xl border border-border/75 bg-card/25 p-4">
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <Link href="/docs/api/v2" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            Open the full Campaign API v2 guide
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <section id="openapi" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <FileJson2 className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">OpenAPI: use the machine-readable contract</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          The public OpenAPI 3.1 specification describes Campaign API v2, Bearer authentication, schemas, operation IDs, pagination, and Tri-Proof-specific decision/evidence boundaries. Use it for generated types, client generation, contract tests, or integration review.
        </p>
        <div className="mt-5">
          <DocsCodeBlock label="Generate types" language="bash" code={openApi} />
        </div>
        <DocsCallout title="The safety contract is machine-readable too" tone="info">
          API operations publish boundaries such as read-only cluster resources, no historical decision recomputation, no evidence re-scoring during pagination, and the distinction between Cluster Support Confidence and a Sybil probability.
        </DocsCallout>
      </section>

      <section id="sdk" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <Braces className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">TypeScript SDK: typed access to the same resources</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          The repository contains the publish-ready <code className="rounded bg-muted px-1.5 py-0.5 text-xs">@triproof/sdk</code> package source and a typed <code className="rounded bg-muted px-1.5 py-0.5 text-xs">TriProofClient</code>. It exposes campaign-native operations, exact-run history/decisions, decision diff, cluster resources, webhook management, and existing ScamGuard methods.
        </p>
        <div className="mt-5">
          <DocsCodeBlock label="TypeScript client" language="ts" code={sdkExample} />
        </div>
        <DocsCallout title="Distribution status" tone="warning">
          The SDK is documented as publish-ready in the repository, but this documentation does not claim that a public npm release is already available. Confirm your project&apos;s package-distribution path before using an npm install command in production setup instructions.
        </DocsCallout>
        <div className="mt-5">
          <Link href="/docs/api/v2/sdk" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            Read SDK reference
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <section id="webhooks" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <Webhook className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">Webhooks: react to completed work instead of polling forever</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Campaign webhooks can notify your backend about analysis completion, review-required state, Decision Package readiness, campaign policy changes, and campaign lifecycle changes. Delivery is signed, persisted, retried through the hardened outbound path, and observable through delivery history.
        </p>
        <div className="mt-5">
          <DocsCodeBlock label="Signature input" language="text" code={webhookVerify} />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            ["Verify before parsing business logic", "Validate timestamp/signature over the exact raw body before trusting the event."],
            ["Make your handler idempotent", "Treat repeated delivery attempts as the same event rather than a second campaign action."],
            ["Return promptly", "Persist the event and move expensive downstream work to your own queue when practical."],
            ["Use delivery history", "Inspect health, failures, attempt count, and controlled retry instead of guessing whether a customer endpoint received an event."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-xl border border-border/75 bg-card/25 p-4">
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
        <DocsCallout title="Webhook failure does not roll back campaign state" tone="info">
          Delivery health is operational telemetry, not wallet evidence. A failed customer endpoint does not undo a completed analysis, policy activation, lifecycle transition, or persisted wallet decision.
        </DocsCallout>
      </section>

      <section id="architecture" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <Layers3 className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">Recommended backend architecture</h2>
        </div>
        <div className="mt-5 overflow-hidden rounded-xl border border-border/75 bg-card/25 p-5">
          <div className="font-mono text-xs leading-7 text-muted-foreground">
            Your campaign platform<br />
            &nbsp;&nbsp;↓ server-side Bearer API key<br />
            Tri-Proof Campaign API v2<br />
            &nbsp;&nbsp;↓ persisted campaign / run / decision resources<br />
            Signed webhook → your backend event handler<br />
            &nbsp;&nbsp;↓ verified + idempotent<br />
            Reward / review / case-management workflow
          </div>
        </div>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          Keep Tri-Proof&apos;s stored operational decision separate from your own irreversible reward action. For Review cases, preserve a human-review checkpoint instead of converting every API response into automatic exclusion.
        </p>
      </section>

      <DocsNextLinks
        items={[
          {
            href: "/docs/api/v2",
            label: "Campaign API v2 reference",
            description: "See campaign resources, run creation, cluster intelligence, decisions, lifecycle, and policy examples.",
          },
          {
            href: "/docs/webhooks",
            label: "Webhook implementation guide",
            description: "Set up subscriptions, verify HMAC signatures, inspect delivery health, and retry safely.",
          },
        ]}
      />
    </ProductDocsShell>
  )
}
