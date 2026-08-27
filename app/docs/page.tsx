import Link from "next/link"
import {
  ArrowRight,
  Blocks,
  CheckCircle2,
  Code2,
  FileSearch,
  History,
  Network,
  ScanSearch,
  ShieldCheck,
  UploadCloud,
} from "lucide-react"

import {
  DocsCallout,
  DocsNextLinks,
  DocsPageIntro,
  ProductDocsShell,
} from "@/components/docs/product-docs-shell"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const metadata = {
  title: "Tri-Proof Documentation | Product Guides & API",
  description:
    "Learn how to run Web3 campaign analysis, investigate wallet relationships, use ScamGuard, and integrate Tri-Proof through API v2, SDK, and webhooks.",
}

const toc = [
  { id: "start", label: "Start with a workflow" },
  { id: "campaign-workflow", label: "Campaign workflow" },
  { id: "decision-model", label: "Decision model" },
  { id: "products", label: "Product guides" },
  { id: "integrate", label: "Integrate" },
  { id: "boundaries", label: "Evidence boundaries" },
]

const workflow = [
  {
    icon: UploadCloud,
    title: "1. Create a campaign",
    text: "Define the chain, campaign type, risk policy, dates, reward context, and optional campaign contracts before the first wallet cohort arrives.",
  },
  {
    icon: Blocks,
    title: "2. Add a wallet cohort",
    text: "Upload a CSV or send JSON. Tri-Proof validates addresses, removes duplicates, preserves useful campaign context, and rejects invalid rows transparently.",
  },
  {
    icon: ShieldCheck,
    title: "3. Run analysis",
    text: "Real on-chain providers enrich the cohort. Funding provenance, behavioral evidence, graph relationships, and policy-safe decision logic are evaluated together.",
  },
  {
    icon: Network,
    title: "4. Investigate",
    text: "Review wallet decisions and clusters through evidence, graph, timeline, support context, and analyst workflows instead of relying on a single score.",
  },
  {
    icon: FileSearch,
    title: "5. Deliver decisions",
    text: "Export Allow / Review / Exclude outputs and investigation packages for campaign operations, audit, partner handoff, or internal review.",
  },
  {
    icon: History,
    title: "6. Repeat and compare",
    text: "Keep later cohorts under the same campaign, inspect exact historical runs, and compare persisted decision changes without rewriting prior results.",
  },
]

const productGuides = [
  {
    icon: ShieldCheck,
    title: "Campaign analysis",
    description: "From CSV preparation to a finished Decision Package.",
    href: "/docs/campaign-analysis",
    cta: "Run a campaign analysis",
  },
  {
    icon: Network,
    title: "Wallet & cluster investigations",
    description: "Understand graph relationships, evidence lanes, timelines, and analyst review.",
    href: "/docs/investigations",
    cta: "Learn investigations",
  },
  {
    icon: ScanSearch,
    title: "ScamGuard",
    description: "Review URLs, transaction intent, tokens, contracts, and signing context before action.",
    href: "/docs/scamguard",
    cta: "Learn ScamGuard",
  },
  {
    icon: Code2,
    title: "Integrations",
    description: "Choose REST API v2, the TypeScript SDK package, OpenAPI, or signed webhooks.",
    href: "/docs/integrations",
    cta: "Choose an integration",
  },
]

export default function DocsPage() {
  return (
    <ProductDocsShell currentPath="/docs" toc={toc}>
      <DocsPageIntro
        eyebrow="Documentation"
        title="Build safer reward campaigns with explainable evidence"
        description="Tri-Proof documentation is organized around the work you actually need to do: analyze a participant cohort, investigate suspicious relationships, protect users before signing, and integrate the results into your own systems."
      >
        <Link href="/docs/campaign-analysis" className={cn(buttonVariants(), "gap-2")}>
          Start with campaign analysis
          <ArrowRight className="size-4" />
        </Link>
        <Link href="/docs/api/v2" className={buttonVariants({ variant: "outline" })}>
          API v2 reference
        </Link>
      </DocsPageIntro>

      <section id="start" className="scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">Start with the job you need to finish</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
          You do not need to understand every Tri-Proof subsystem before using the product. Pick the workflow that matches your role and follow the guide end to end.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {productGuides.map((guide) => {
            const Icon = guide.icon
            return (
              <Link
                key={guide.href}
                href={guide.href}
                className="group rounded-2xl border border-border/75 bg-card/35 p-5 transition-colors hover:border-primary/35 hover:bg-primary/[0.035]"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/8 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold group-hover:text-primary">{guide.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{guide.description}</p>
                    <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                      {guide.cta}
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <section id="campaign-workflow" className="mt-14 scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">The campaign workflow</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
          A campaign is the durable container. Keep repeated snapshots under one campaign so policy history, investigations, exports, and run-to-run comparisons remain auditable.
        </p>
        <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-border/75 bg-border/75 sm:grid-cols-2">
          {workflow.map((step) => {
            const Icon = step.icon
            return (
              <div key={step.title} className="bg-background p-5 sm:p-6">
                <div className="flex items-center gap-2.5">
                  <Icon className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">{step.title}</h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.text}</p>
              </div>
            )
          })}
        </div>
      </section>

      <section id="decision-model" className="mt-14 scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">Understand the operational decision model</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
          Tri-Proof separates operational output from forensic interpretation. A decision tells your campaign what to do next; the evidence explains why the wallet or cluster deserves that treatment.
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {[
            ["Allow", "Candidate for automatic inclusion under the stored campaign policy when available evidence supports normal participation."],
            ["Review", "Needs human context. This is the correct destination for uncertainty, incomplete coverage, or evidence that is meaningful but not conclusive."],
            ["Exclude", "Not suitable for automatic inclusion under the stored decision context. Review the evidence before applying irreversible campaign actions."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-xl border border-border/75 bg-card/25 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">{title}</h3>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
        <DocsCallout title="A decision is not an identity claim" tone="warning">
          Allow, Review, and Exclude are campaign-operation states. A cluster, shared funder, or inferred archetype does not prove that the same person controls every wallet, and neutral infrastructure such as recognized exchanges or bridges is not standalone Sybil evidence.
        </DocsCallout>
      </section>

      <section id="products" className="mt-14 scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">Product guides, not feature lists</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
          Each guide explains when to use a product, what input it expects, what you should inspect, and what to do with the result.
        </p>
        <div className="mt-5 divide-y divide-border/70 rounded-xl border border-border/75">
          {productGuides.map((guide) => (
            <Link key={guide.href} href={guide.href} className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/30 sm:p-5">
              <guide.icon className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{guide.title}</div>
                <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{guide.description}</div>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </section>

      <section id="integrate" className="mt-14 scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">Integrate only when you need to</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
          Pilot teams can start with the dashboard and a CSV. Product teams can later move to API v2, generated OpenAPI clients, the TypeScript SDK package, and signed webhooks without changing the core decision semantics.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            ["Dashboard", "Best for pilots and analyst-led operations.", "/dashboard/campaigns/new"],
            ["Campaign API v2", "Best for repeatable backend campaign workflows.", "/docs/api/v2"],
            ["TypeScript SDK", "Typed client package for Tri-Proof API workflows.", "/docs/api/v2/sdk"],
            ["Webhooks", "Signed events for completed analyses and operational changes.", "/docs/webhooks"],
          ].map(([title, text, href]) => (
            <Link key={href} href={href} className="rounded-xl border border-border/75 bg-card/25 p-4 transition-colors hover:border-primary/30">
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
            </Link>
          ))}
        </div>
      </section>

      <section id="boundaries" className="mt-14 scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">Evidence boundaries are part of the product</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
          Tri-Proof is designed to preserve uncertainty instead of converting every relationship into a malicious conclusion. Keep these boundaries in your own operational workflow as well.
        </p>
        <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
          {[
            "Shared funding is an investigation lead; unknown shared funding alone is not conclusive.",
            "Recognized exchange, bridge, protocol, service, or trusted-distributor fan-out is neutral context unless independent evidence changes the case.",
            "Provider failure and insufficient data are coverage limitations, not malicious wallet evidence.",
            "Cluster Support Confidence measures support for an already-stored grouping; it is not a Sybil probability.",
            "Inferred cluster archetypes are forensic hypotheses and never proof of common ownership or identity.",
            "Historical run and export resources read persisted decisions; they do not silently rerun current policy over old results.",
          ].map((item) => (
            <li key={item} className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <Link href="/docs/trust" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            Read the trust and evidence guide
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <DocsNextLinks
        items={[
          {
            href: "/docs/campaign-analysis",
            label: "Run your first campaign analysis",
            description: "Prepare a wallet list, create a campaign, run analysis, investigate, and export decisions.",
          },
          {
            href: "/docs/integrations",
            label: "Plan an integration",
            description: "Decide whether dashboard, API v2, SDK, OpenAPI, or webhooks fits your workflow.",
          },
        ]}
      />
    </ProductDocsShell>
  )
}
