import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  FileCheck2,
  Puzzle,
  Radar,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Target,
} from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = {
  title: "Grants | Tri-Proof Protocol",
  description: "Tri-Proof Protocol grant scope, working product evidence, and proposed security milestones.",
}

const grantHighlights = [
  {
    icon: Target,
    title: "Problem",
    text: "Web3 campaigns attract coordinated wallets, fake reward pages, and unsafe signing prompts. Teams need protection before funds or signatures move.",
  },
  {
    icon: ShieldCheck,
    title: "Working solution",
    text: "Tri-Proof combines wallet eligibility review with ScamGuard pre-sign intelligence and Telegram community protection.",
  },
  {
    icon: Rocket,
    title: "Grant output",
    text: "Funding accelerates public-good threat intelligence, stronger transaction decoding, safer onboarding, and measurable pilot integrations.",
  },
] as const

const milestones = [
  ["M1", "Transaction decoding", "Expand Solana and supported EVM transaction-intent coverage, including authority, approval, and asset-movement risk."],
  ["M2", "Project intelligence registry", "Strengthen verified, suspicious, and known-bad project intelligence with auditable false-positive handling."],
  ["M3", "Distribution and onboarding", "Improve extension onboarding, Telegram community setup, warning explanations, and security documentation."],
  ["M4", "Selected integration pilots", "Validate the Developer API, signed webhooks, and Team Policies with real partner usage before broad production claims."],
] as const

const productProof = [
  [ShieldAlert, "ScamGuard", "Scan links, wallets, token contracts, and transaction intent.", "/scamguard", "Sign in to scanner"],
  [Radar, "Sybil Analyst", "Review wallet lists, suspicious clusters, and exportable decisions.", "/audit", "Run mini audit"],
  [Puzzle, "Chrome Extension", "Review the beta distribution, permissions, and installation path.", "/extension", "Open extension page"],
  [Code2, "Developer documentation", "Inspect current endpoints and selected-pilot integration surfaces.", "/docs/api", "Read API docs"],
] as const

export default function GrantsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />

      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 w-fit border-primary/30 text-primary">Grant and ecosystem partnerships</Badge>
          <h1 className="text-gradient max-w-5xl text-4xl font-semibold sm:text-6xl">A working Web3 security platform with a focused public-good roadmap.</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">This page separates Tri-Proof&apos;s grant narrative from the customer buying journey. Reviewers can evaluate the problem, current product evidence, proposed milestones, and measurable outcomes here.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/contact?topic=grant-partnership" className={buttonVariants()}>Discuss a grant partnership <ArrowRight data-icon="inline-end" /></Link>
            <Link href="/#solutions" className={buttonVariants({ variant: "outline" })}>View customer solutions</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-5 lg:grid-cols-3">
          {grantHighlights.map((item) => {
            const Icon = item.icon
            return (
              <Card key={item.title} className="glass-panel premium-card">
                <CardHeader><span className="mb-3 flex size-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><Icon /></span><CardTitle>{item.title}</CardTitle><CardDescription className="leading-6">{item.text}</CardDescription></CardHeader>
              </Card>
            )
          })}
        </div>
      </section>

      <section className="border-y border-border bg-primary/[0.03]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="mb-9 max-w-3xl"><Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">Proposed milestones</Badge><h2 className="text-gradient text-3xl font-semibold sm:text-5xl">Concrete deliverables with visible product evidence.</h2></div>
          <div className="grid gap-4 lg:grid-cols-2">
            {milestones.map(([phase, title, text]) => (
              <Card key={phase} className="glass-panel premium-card">
                <CardContent className="grid gap-4 p-6 sm:grid-cols-[58px_1fr]">
                  <span className="flex size-12 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 font-mono text-sm font-semibold text-primary">{phase}</span>
                  <div><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="mb-9 max-w-3xl"><Badge variant="secondary" className="mb-4 w-fit gap-2 border-primary/30 text-primary"><FileCheck2 className="size-3.5" /> Working proof</Badge><h2 className="text-gradient text-3xl font-semibold sm:text-5xl">Evaluate live and testable surfaces.</h2></div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {productProof.map(([Icon, title, text, href, action]) => (
            <Card key={title} className="glass-panel premium-card hover-lift"><CardHeader><Icon className="mb-2 size-5 text-primary" /><CardTitle>{title}</CardTitle><CardDescription>{text}</CardDescription></CardHeader><CardContent><Link href={href} className={`${buttonVariants({ variant: "outline" })} w-full`}>{action}<ArrowRight data-icon="inline-end" /></Link></CardContent></Card>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
            {["No seed phrases, private keys, or custody path", "Explainable decisions and human review", "Public validation dataset and sample report", "Advanced capabilities positioned as selected pilots"].map((item) => <div key={item} className="flex items-start gap-3 rounded-xl border border-border bg-background/45 p-4"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /><span>{item}</span></div>)}
          </div>
        </div>
      </section>
    </main>
  )
}
