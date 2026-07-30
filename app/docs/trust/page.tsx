import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  GitBranch,
  LockKeyhole,
  Network,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = {
  title: "Trust & Methodology | Tri-Proof Guard",
  description:
    "How Tri-Proof Guard explains wallet risk, ScamGuard boundaries, reason codes and false-positive handling.",
}

const methodCards = [
  [Network, "On-chain evidence first", "Wallet age, transaction history, funding source, contract diversity and campaign actions are treated as evidence, not identity claims."],
  [GitBranch, "Cluster review", "Shared funding and similar behavior create review groups so teams can inspect linked wallets together."],
  [ShieldAlert, "ScamGuard signal", "ScamGuard adds suspicious URL, token mint and transaction intent checks, but it does not replace wallet risk scoring."],
  [LockKeyhole, "Privacy boundary", "Reports avoid raw personal data. Proof packages are campaign-scoped and explainable without becoming a global identity record."],
] as const

const reasonCodes = [
  ["KNOWN_ENTITY", "Exchange, bridge, protocol, service or public infrastructure wallet."],
  ["SHARED_FUNDING", "Multiple wallets appear connected by funding origin."],
  ["CLUSTER_LINKED", "Wallet belongs to a suspicious behavioral or funding group."],
  ["LOW_HISTORY", "Not enough reliable on-chain history for automatic approval."],
  ["CAMPAIGN_ONLY_ACTIVITY", "Wallet behavior is concentrated around campaign actions."],
  ["REQUIRES_REVIEW", "Human team decision should happen before distribution."],
  ["REWARD_EXCLUDED", "Current policy excludes this wallet from the clean list."],
]

const safeguards = [
  "A risk label does not prove fraud or malicious intent.",
  "Known exchange/service wallets are marked for review because they may not represent individual campaign participants.",
  "Team overrides are retained separately from original Tri-Proof scores.",
  "Gray-zone decisions should use evidence, notes and second-reviewer checks for high-value campaigns.",
]

export default function TrustDocsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />
      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
          <Link href="/docs" className={`${buttonVariants({ variant: "outline" })} mb-8`}>
            <ArrowLeft data-icon="inline-start" />
            Back to docs
          </Link>
          <div className="max-w-4xl">
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge variant="secondary">Methodology</Badge>
              <Badge variant="outline">Privacy by design</Badge>
              <Badge variant="outline">Decision support</Badge>
            </div>
            <h1 className="text-gradient text-4xl font-semibold sm:text-6xl">
              Trust & methodology evidence boundaries.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
              Tri-Proof Guard helps campaign teams make defensible reward decisions. It combines wallet evidence, campaign policy and reviewer workflow while keeping human judgment and privacy boundaries explicit.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-12 sm:px-8 lg:grid-cols-4">
        {methodCards.map(([Icon, title, text]) => (
          <Card key={title} className="glass-panel premium-card">
            <CardHeader>
              <Icon className="text-primary" />
              <CardTitle>{title}</CardTitle>
              <CardDescription>{text}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="border-y border-border bg-primary/[0.03]">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-12 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <span className="cyber-chip">Reason code dictionary</span>
            <h2 className="text-gradient mt-5 text-3xl font-semibold">Compact labels for explainable decisions.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Reason codes make exports, API responses and customer reports easier to audit. Each code maps to human-readable evidence in the wallet drawer.
            </p>
          </div>
          <div className="grid gap-3">
            {reasonCodes.map(([code, text]) => (
              <div key={code} className="rounded-lg border border-border bg-background/55 p-4">
                <p className="font-mono text-sm text-primary">{code}</p>
                <p className="mt-2 text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_1fr]">
        <Card className="glass-panel premium-card border-amber-400/25 bg-amber-400/5">
          <CardHeader>
            <AlertTriangle className="text-amber-300" />
            <CardTitle>False-positive handling</CardTitle>
            <CardDescription>
              Tri-Proof reports keep gray-zone wallets separate from rejects, support team notes, and retain override history so campaign teams can correct conservative or aggressive decisions.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card className="glass-panel premium-card border-green-400/25 bg-green-400/5">
          <CardHeader>
            <ShieldAlert className="text-green-300" />
            <CardTitle>ScamGuard boundary</CardTitle>
            <CardDescription>
              ScamGuard is a pre-sign risk screen for Solana links, token mints and transaction intent. It is not a guarantee, does not replace Sybil scoring, and should be used as one signal among several.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-14 sm:px-8">
        <div className="glass-panel premium-card rounded-2xl p-6">
          <div className="mb-5 flex items-center gap-3">
            <ShieldCheck className="text-primary" />
            <h2 className="text-2xl font-semibold">Operational safeguards</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {safeguards.map((item) => (
              <div key={item} className="flex gap-3 rounded-lg border border-border bg-background/45 p-4 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 shrink-0 text-primary" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
