import Link from "next/link"
import {
  ArrowRight,
  BookOpen,
  Braces,
  Code2,
  FileJson2,
  GraduationCap,
  HeartPulse,
  Network,
  Radar,
  Send,
  ServerCog,
  ShieldCheck,
  Webhook,
} from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = {
  title: "Documentation | Tri-Proof Protocol",
  description: "Technical reference for Tri-Proof Protocol products, APIs, webhooks, production operations and security methodology.",
}

const productDocs = [
  {
    icon: Radar,
    title: "Sybil Analyst",
    text: "Campaign wallet analysis, evidence, policy simulation, human review and decision exports.",
    href: "/learn#sybil",
    action: "Open Sybil guide",
  },
  {
    icon: ShieldCheck,
    title: "ScamGuard",
    text: "Pre-click and pre-sign checks for URLs, wallets, token contracts and transaction intent.",
    href: "/scamguard",
    action: "Open ScamGuard",
  },
  {
    icon: Send,
    title: "Group Guardian",
    text: "Telegram community protection, alert thresholds, repeated-threat context and moderator controls.",
    href: "/learn#group-guardian",
    action: "Open Guardian guide",
  },
  {
    icon: BookOpen,
    title: "Product Academy",
    text: "Step-by-step product training for operators who want guided workflows rather than API reference.",
    href: "/learn",
    action: "Start learning",
  },
] as const

const developerDocs = [
  [Code2, "API v1", "ScamGuard scans and wallet-list analysis for product integrations.", "/docs/api"],
  [Braces, "Campaign API v2", "Campaign-native analyses, policy, decisions and forensic investigation resources.", "/docs/api/v2"],
  [Network, "Cluster API", "Page stored clusters, inspect evidence, members and read-only case exports.", "/docs/api/v2/clusters"],
  [FileJson2, "OpenAPI 3.1", "Machine-readable Campaign API v2 contract for generated clients and types.", "/docs/api/v2/openapi"],
  [Code2, "TypeScript SDK", "Publish-ready typed client surface for Campaign API v2.", "/docs/api/v2/sdk"],
  [Webhook, "Webhooks", "Signed campaign and Team Policy events with delivery safety boundaries.", "/docs/webhooks"],
] as const

const operationsDocs = [
  [ShieldCheck, "Trust & methodology", "Risk-model boundaries, evidence semantics and responsible interpretation.", "/docs/trust"],
  [HeartPulse, "Production readiness", "Health checks, migrations, providers, queue state and runtime diagnostics.", "/docs/production"],
  [ServerCog, "Queue workers", "Server-side batch processing, stale recovery and webhook retries.", "/docs/queue"],
  [BookOpen, "Data retention", "Retention and deletion boundaries for product and account data.", "/data-retention"],
] as const

export default function DocsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />

      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
          <Badge variant="outline" className="mb-5 border-cyan-300/20 bg-cyan-300/[0.04] text-cyan-100">
            Technical reference
          </Badge>
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="text-gradient max-w-5xl text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
                Tri-Proof documentation.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">
                Use Docs for technical contracts, operational boundaries and integration reference. For guided product walkthroughs, use the Product Academy.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/learn" className={`${buttonVariants()} glow-primary`}>
                <GraduationCap data-icon="inline-start" /> Product Academy
              </Link>
              <Link href="/docs/api/v2" className={buttonVariants({ variant: "outline" })}>
                Campaign API v2 <ArrowRight data-icon="inline-end" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
        <div className="mb-8 max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-200/65">Product guides</p>
          <h2 className="mt-3 text-3xl font-semibold text-white">Choose the surface you are working with.</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Product guides explain what each surface does and route operators to the right workflow.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {productDocs.map(({ icon: Icon, title, text, href, action }) => (
            <Card key={title} className="glass-panel premium-card hover-lift flex flex-col">
              <CardHeader>
                <span className="flex size-10 items-center justify-center rounded-xl border border-cyan-300/14 bg-cyan-300/[0.04]"><Icon className="size-5 text-cyan-300" /></span>
                <CardTitle className="mt-3">{title}</CardTitle>
                <CardDescription className="leading-6">{text}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Link href={href} className={buttonVariants({ variant: "outline", size: "sm" })}>{action} <ArrowRight data-icon="inline-end" /></Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-primary/[0.025]">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
          <div className="mb-8 max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-violet-200/65">Developer reference</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Build on stable API contracts.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Protocol versions remain visible where they define an integration contract; internal product-release labels stay out of customer-facing UI.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {developerDocs.map(([Icon, title, text, href]) => (
              <Link key={title} href={href} className="group rounded-2xl border border-white/[0.065] bg-white/[0.018] p-5 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.025]">
                <Icon className="size-5 text-cyan-300" />
                <h3 className="mt-4 font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-cyan-300">Open reference <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
        <div className="mb-8 max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-200/65">Trust & operations</p>
          <h2 className="mt-3 text-3xl font-semibold text-white">Operate and interpret the system responsibly.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {operationsDocs.map(([Icon, title, text, href]) => (
            <Card key={title} className="glass-panel premium-card">
              <CardHeader><Icon className="size-5 text-primary" /><CardTitle className="text-base">{title}</CardTitle><CardDescription className="leading-6">{text}</CardDescription></CardHeader>
              <CardContent><Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">Open <ArrowRight className="size-4" /></Link></CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-5 rounded-3xl border border-cyan-300/12 bg-cyan-300/[0.025] p-6 sm:flex-row sm:items-center sm:p-8">
          <div>
            <h2 className="text-xl font-semibold text-white">Not sure where to start?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Use the Academy for guided product workflows, or contact the team when your integration needs campaign-specific architecture review.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/learn" className={buttonVariants()}>Open Academy</Link>
            <Link href="/contact" className={buttonVariants({ variant: "outline" })}>Contact Tri-Proof</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
