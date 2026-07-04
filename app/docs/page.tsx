import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  CircleHelp,
  DatabaseZap,
  FileDown,
  GitBranch,
  Landmark,
  Layers3,
  Mail,
  Network,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  WalletCards,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata = {
  title: "How Tri-Proof Guard Works | Web3 Wallet Risk Analysis",
  description:
    "Learn how Tri-Proof Guard analyzes wallet lists, detects suspicious clusters, identifies known entities, and helps Web3 teams make safer reward distribution decisions.",
}

const navLinks = [
  ["Home", "/"],
  ["Trust", "/docs/trust"],
  ["Blog", "/blog"],
  ["Pricing", "/pricing"],
  ["Contact", "/contact"],
]

const workflow = [
  {
    icon: UploadCloud,
    title: "Upload a wallet CSV",
    text: "Import addresses from airdrops, quests, testnets, allowlists or community reward campaigns.",
  },
  {
    icon: DatabaseZap,
    title: "Collect on-chain evidence",
    text: "Tri-Proof Guard enriches wallet addresses with real provider data such as wallet age, transaction history, balances and interaction signals.",
  },
  {
    icon: BrainCircuit,
    title: "Analyze risk signals",
    text: "The system reviews funding source patterns, known entities, transaction history, contract diversity and suspicious clusters.",
  },
  {
    icon: FileDown,
    title: "Export decision lists",
    text: "Download approved, Gray Zone and rejected wallet outputs as CSV or PDF for internal reward decisions.",
  },
]

const signals = [
  [WalletCards, "Wallet age", "Newly created wallets are reviewed more carefully when combined with other weak signals."],
  [Radar, "Transaction history", "Low activity or limited historical usage can be a risk signal before reward distribution."],
  [Network, "Funding source", "Groups funded from the same on-chain origin can be surfaced for Gray Zone review."],
  [Layers3, "Contract diversity", "The engine checks whether wallets show real usage or narrow one-purpose activity."],
  [Landmark, "Known entities", "Exchange, bridge, service and protocol wallets are marked as review-only entities."],
  [GitBranch, "Suspicious clusters", "Similar behavior and shared funding patterns are grouped into readable cluster evidence."],
]

const outcomes = [
  {
    title: "Approved",
    tone: "border-green-400/30 bg-green-400/10 text-green-300",
    text: "Low-risk wallets with no known entity, suspicious cluster or shared funding-source signal.",
  },
  {
    title: "Gray Zone",
    tone: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    text: "Wallets that need human review because of entity, funding, cluster or contextual risk evidence.",
  },
  {
    title: "Rejected / Not Eligible",
    tone: "border-red-400/30 bg-red-400/10 text-red-300",
    text: "Wallets with severe combined risk signals that may be excluded from reward distribution.",
  },
]

const faqs = [
  [
    "Does Tri-Proof Guard make the final decision?",
    "No. Tri-Proof Guard provides decision support. The final reward decision remains with the project team.",
  ],
  [
    "Is a low-risk wallet always safe?",
    "No. Risk scores should be read with context. A low score means no major risk signal was detected from available data.",
  ],
  [
    "Does cluster membership prove malicious behavior?",
    "No. A cluster is a review signal, not a legal or identity claim. It indicates that a project team should inspect the group before distribution.",
  ],
  [
    "Can reports be exported?",
    "Yes. Teams can export approved, Gray Zone, rejected and full report files for internal operations.",
  ],
]

export default function DocsPage() {
  return (
    <main className="premium-page min-h-screen overflow-hidden bg-background text-foreground">
      <section className="security-grid relative overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="glow-orb left-[-7rem] top-[-5rem] size-96" style={{ background: "var(--guard-cyan)" }} />
          <div className="glow-orb right-[-9rem] top-20 size-[28rem]" style={{ background: "var(--guard-purple)", animationDelay: "2s" }} />
          <div className="glow-orb bottom-[-10rem] left-1/3 size-96" style={{ background: "var(--guard-cyan)", opacity: 0.25, animationDelay: "5s" }} />
        </div>

        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <span className="glow-primary flex size-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 transition-transform group-hover:scale-105">
              <Image src="/logo.svg" alt="Tri-Proof Guard" width={30} height={30} priority className="rounded-lg" />
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Tri-Proof Guard</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary/80">Docs</span>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            {navLinks.map(([label, href]) => (
              <Link key={label} href={href} className="transition-colors hover:text-primary">
                {label}
              </Link>
            ))}
          </nav>
          <Link href="/audit" className={`${buttonVariants()} glow-primary hover-lift`}>Start Free</Link>
        </header>

        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:pb-24 lg:pt-20">
          <div className="reveal-up flex flex-col gap-7">
            <div className="flex flex-wrap items-center gap-3">
              <span className="cyber-chip">Web3 Campaign Wallet Risk Documentation</span>
              <Badge variant="secondary" className="border-primary/30 text-primary">Human-readable guide</Badge>
            </div>
            <h1 className="text-gradient animate-gradient-text max-w-4xl text-4xl font-semibold leading-tight text-balance sm:text-6xl lg:text-7xl">
              How Tri-Proof Guard works.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Tri-Proof Guard helps Web3 teams understand campaign wallet lists before they distribute rewards. Upload wallets, enrich them with real on-chain evidence, review suspicious clusters and export cleaner decision lists.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/audit" className={`${buttonVariants({ size: "lg" })} glow-primary hover-lift`}>Run a mini audit <ArrowRight data-icon="inline-end" /></Link>
            <Link href="/dashboard/demo" className={`${buttonVariants({ variant: "outline", size: "lg" })} hover-lift`}>View demo report</Link>
            <Link href="/docs/trust" className={`${buttonVariants({ variant: "outline", size: "lg" })} hover-lift`}>Trust methodology</Link>
            </div>
          </div>

          <div className="glass-panel premium-card animated-border data-scan relative min-h-[460px] overflow-hidden rounded-3xl p-5 reveal-up delay-200">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Wallet Risk Workflow</p>
                <p className="text-xs text-muted-foreground">From CSV upload to reward decision</p>
              </div>
              <Badge variant="secondary" className="gap-2 border-primary/30 text-primary"><span className="pulse-dot" /> Live guide</Badge>
            </div>
            <div className="space-y-4">
              {workflow.map((step, index) => {
                const Icon = step.icon
                return (
                  <div key={step.title} className="hover-lift rounded-2xl border border-primary/20 bg-background/55 p-4 reveal-up" style={{ animationDelay: `${index * 0.08}s` }}>
                    <div className="flex gap-4">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><Icon className="size-5" /></span>
                      <div>
                        <p className="font-semibold">{index + 1}. {step.title}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.text}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="what" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div className="reveal-up">
            <span className="cyber-chip">What it solves</span>
            <h2 className="text-gradient mt-5 text-3xl font-semibold sm:text-5xl">A clearer view before reward distribution.</h2>
            <p className="mt-5 leading-7 text-muted-foreground">
              A large wallet list does not always mean real community growth. Some campaigns include low-quality wallets, repeated behavior, shared funding patterns or exchange/service addresses. Tri-Proof Guard turns that raw list into operational decisions your team can review.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              [ShieldAlert, "Reduce reward leakage", "Surface risky wallets before token, USDC or points distribution."],
              [ShieldCheck, "Support defensible decisions", "Explain why a wallet is approved, reviewed or rejected."],
              [Network, "Expose suspicious groups", "Cluster wallets by funding and behavior signals instead of reviewing one address at a time."],
              [BadgeCheck, "Keep humans in control", "Tri-Proof Guard recommends decisions; your project team keeps the final call."],
            ].map(([Icon, title, text], index) => (
              <Card key={title as string} className="glass-panel premium-card hover-lift reveal-up" style={{ animationDelay: `${index * 0.08}s` }}>
                <CardHeader>
                  <Icon className="text-primary" />
                  <CardTitle>{title as string}</CardTitle>
                  <CardDescription>{text as string}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="signals" className="border-y border-border bg-primary/[0.03]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
          <div className="mb-10 max-w-3xl">
            <span className="cyber-chip">Risk signals</span>
            <h2 className="text-gradient mt-5 text-3xl font-semibold sm:text-5xl">What Tri-Proof Guard checks.</h2>
            <p className="mt-4 text-muted-foreground">No single signal proves fraud. The product combines multiple pieces of on-chain evidence and turns them into readable review signals.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {signals.map(([Icon, title, text], index) => (
              <Card key={title as string} className="glass-panel premium-card hover-lift reveal-up" style={{ animationDelay: `${index * 0.06}s` }}>
                <CardHeader>
                  <Icon className="text-primary" />
                  <CardTitle>{title as string}</CardTitle>
                  <CardDescription>{text as string}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="results" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div className="glass-panel premium-card animated-border rounded-3xl p-6 reveal-up">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="font-medium">Report output</p>
                <p className="text-sm text-muted-foreground">Simple labels for complex wallet evidence</p>
              </div>
              <Sparkles className="text-primary" />
            </div>
            <div className="space-y-4">
              {outcomes.map((item) => (
                <div key={item.title} className="rounded-2xl border border-border bg-background/55 p-5">
                  <Badge variant="outline" className={item.tone}>{item.title}</Badge>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="reveal-up delay-200">
            <span className="cyber-chip">How to read results</span>
            <h2 className="text-gradient mt-5 text-3xl font-semibold sm:text-5xl">Risk score is a signal, not the whole decision.</h2>
            <p className="mt-5 leading-7 text-muted-foreground">
              The numeric score helps prioritize review. The status label is the operational recommendation. It also considers context such as known entities, suspicious clusters and shared funding sources.
            </p>
            <div className="mt-6 rounded-2xl border border-primary/25 bg-primary/10 p-5">
              <p className="text-sm leading-6 text-muted-foreground">
                A cluster does not automatically prove malicious behavior. It means a group of wallets shares enough evidence to deserve review before rewards are sent.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 lg:pb-24">
        <div className="mb-8 max-w-3xl">
          <span className="cyber-chip">FAQ</span>
          <h2 className="text-gradient mt-5 text-3xl font-semibold sm:text-5xl">Common questions.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {faqs.map(([question, answer], index) => (
            <Card key={question} className="glass-panel premium-card hover-lift reveal-up" style={{ animationDelay: `${index * 0.06}s` }}>
              <CardHeader>
                <CircleHelp className="text-primary" />
                <CardTitle>{question}</CardTitle>
                <CardDescription>{answer}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 lg:pb-24">
        <div className="glass-panel premium-card animated-border rounded-3xl p-8 text-center reveal-up">
          <Mail className="mx-auto mb-4 text-primary" />
          <h2 className="text-gradient text-3xl font-semibold">Ready to check your own wallet list?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">Start with a free analysis, then upgrade when your campaign needs larger wallet capacity or operational exports.</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/audit" className={`${buttonVariants({ size: "lg" })} glow-primary hover-lift`}>Start mini audit</Link>
            <Link href="/docs/trust" className={`${buttonVariants({ variant: "outline", size: "lg" })} hover-lift`}>Read trust page</Link>
            <Link href="/contact" className={`${buttonVariants({ variant: "outline", size: "lg" })} hover-lift`}>Contact the team</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
