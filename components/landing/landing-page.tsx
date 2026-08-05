import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  FileCheck2,
  Globe2,
  Layers3,
  LockKeyhole,
  Network,
  Puzzle,
  Radar,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { scamGuardTelegramBotUrl } from "@/lib/telegram/links"

const navLinks = [
  ["Solutions", "#solutions"],
  ["For you", "#personas"],
  ["How it works", "#how-it-works"],
  ["Proof", "#proof"],
  ["Pricing", "/pricing"],
  ["Docs", "/docs"],
] as const

const trustSignals = [
  [LockKeyhole, "No seed phrases", "Tri-Proof never asks for seed phrases, private keys, or wallet passwords."],
  [ShieldCheck, "No custody", "The platform analyzes public targets and transaction intent without taking control of assets."],
  [FileCheck2, "Explainable decisions", "Every warning and wallet decision includes evidence, confidence, and a recommended action."],
  [Users, "Human override", "Teams can review gray-zone wallets and correct false positives before a final decision."],
] as const

const personas = [
  {
    icon: Radar,
    label: "Campaign Team",
    title: "Protect reward distribution",
    text: "Analyze participant wallets, identify coordinated clusters, and export a defensible reward list.",
    href: "/audit",
    action: "Analyze a wallet list",
  },
  {
    icon: Bot,
    label: "Community Admin",
    title: "Protect Telegram communities",
    text: "Scan suspicious posts, quarantine critical threats, and keep an auditable Group Guardian history.",
    href: "/telegram",
    action: "Protect a community",
  },
  {
    icon: WalletCards,
    label: "Web3 User",
    title: "Check before you sign",
    text: "Review links, wallets, token contracts, and transaction intent before committing an on-chain action.",
    href: "/scamguard",
    action: "Sign in to scan",
  },
  {
    icon: Code2,
    label: "Developer",
    title: "Add risk intelligence",
    text: "Evaluate a selected pilot integration for wallets, dApps, launchpads, or campaign platforms.",
    href: "/contact?topic=api-pilot",
    action: "Request an integration pilot",
  },
] as const

const solutions = [
  {
    icon: ScanSearch,
    eyebrow: "Protect users before they sign",
    title: "ScamGuard",
    text: "Understand risky links, wallets, contracts, token mints, and transaction intent before a user clicks, trusts, or signs.",
    features: ["Web Scanner", "Chrome Extension", "Telegram Bot"],
    primaryHref: "/scamguard",
    primaryAction: "Sign in to scan a risk",
    secondaryLinks: [
      ["Chrome Extension", "/extension"],
      ["Telegram Bot", scamGuardTelegramBotUrl],
    ],
  },
  {
    icon: Radar,
    eyebrow: "Protect campaign rewards",
    title: "Sybil Analyst",
    text: "Reduce reward leakage by reviewing low-quality participants, suspicious clusters, and gray-zone wallets before distribution.",
    features: ["Mini Audit", "Full Wallet Analysis", "Cluster Detection", "CSV and PDF Export"],
    primaryHref: "/audit",
    primaryAction: "Analyze a wallet list",
    secondaryLinks: [
      ["View a sample report", "/demo/report"],
      ["See wallet credit pricing", "/pricing#campaign"],
    ],
  },
  {
    icon: Network,
    eyebrow: "Protect communities and products",
    title: "Community & Platform Protection",
    text: "Detect and act on risk inside Telegram communities or selected product integrations without turning advanced capabilities into unproven promises.",
    features: ["Group Guardian", "Project Registry", "Developer API", "Signed Webhooks"],
    primaryHref: "/telegram",
    primaryAction: "Protect a Telegram community",
    secondaryLinks: [
      ["Advanced capabilities", "/pricing#advanced"],
      ["Request a selected pilot", "/contact?topic=security-pilot"],
    ],
    advanced: true,
  },
] as const

const workflow = [
  ["01", "Submit the target", "Paste a risk target or upload a campaign wallet list."],
  ["02", "Enrich the evidence", "Combine domain, transaction, registry, RPC, and campaign signals."],
  ["03", "Receive an explainable decision", "See risk, confidence, reasons, and the recommended next action."],
  ["04", "Act or export", "Warn a user, review a wallet, protect a group, or export decision lists."],
] as const

const proofCards = [
  {
    icon: ShieldAlert,
    title: "ScamGuard result",
    text: "Inspect the evidence structure used for links, wallets, token contracts, and transaction intent.",
    href: "/scamguard",
    action: "Sign in to open Scanner",
  },
  {
    icon: Radar,
    title: "Sybil decision report",
    text: "Review approved, gray-zone, and rejected/not-eligible outputs from the public validation dataset.",
    href: "/demo/report",
    action: "Open sample report",
  },
  {
    icon: Bot,
    title: "Telegram protection",
    text: "See how private scans, watchlists, and Group Guardian fit community operations.",
    href: "/telegram",
    action: "Open Telegram product page",
  },
  {
    icon: Code2,
    title: "Integration surface",
    text: "Review current API documentation while production access remains available through selected pilots.",
    href: "/docs/api",
    action: "Review API documentation",
  },
] as const

const pricingChoices = [
  [WalletCards, "My own wallet", "Free or Builder", "/pricing#personal"],
  [Bot, "A Telegram community", "Community", "/pricing#community"],
  [Radar, "An airdrop or campaign", "Wallet credits", "/pricing#campaign"],
  [Code2, "A wallet, dApp, or platform", "Selected pilot", "/pricing#advanced"],
] as const

export function LandingPage() {
  return (
    <main className="premium-page min-h-screen overflow-hidden bg-background text-foreground">
      <section className="security-grid relative overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="glow-orb left-[-7rem] top-[-5rem] size-96" style={{ background: "var(--guard-cyan)" }} />
          <div className="glow-orb right-[-9rem] top-20 size-[28rem]" style={{ background: "var(--guard-purple)", animationDelay: "2s" }} />
        </div>

        <header className="relative z-10 mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <span className="glow-primary flex size-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 transition-transform group-hover:scale-105">
              <Image src="/logo.svg" alt="Tri-Proof Protocol" width={30} height={30} priority className="rounded-lg" />
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Tri-Proof Protocol</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary/80">Guard Platform</span>
            </div>
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-muted-foreground lg:flex">
            {navLinks.map(([label, href]) => (
              <Link key={label} href={href} className="transition-colors hover:text-primary">
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className={`${buttonVariants({ variant: "outline" })} hidden sm:inline-flex`}>Login</Link>
            <Link href="/scamguard" className={`${buttonVariants()} glow-primary`}>Sign in to scan</Link>
          </div>
        </header>

        <div className="relative z-10 mx-auto grid max-w-[1500px] gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.03fr_0.97fr] lg:items-center lg:pb-20 lg:pt-16">
          <div className="reveal-up flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="cyber-chip">Web3 security platform</span>
              <Badge variant="secondary" className="border-primary/30 text-primary">Solana-first, multichain where risk demands it</Badge>
            </div>
            <div>
              <h1 className="text-gradient animate-gradient-text max-w-4xl text-4xl font-semibold leading-[1.04] text-balance sm:text-5xl lg:text-6xl">
                Stop fake participants and risky signatures before they cost your campaign.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                Tri-Proof helps Web3 teams analyze wallet lists, scan links and transactions, and protect Telegram communities before rewards or signatures move.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/scamguard" className={`${buttonVariants({ size: "lg" })} glow-primary hover-lift`}>
                Sign in to scan a risk <ArrowRight data-icon="inline-end" />
              </Link>
              <Link href="/audit" className={`${buttonVariants({ variant: "outline", size: "lg" })} hover-lift`}>
                Analyze a wallet list <ArrowRight data-icon="inline-end" />
              </Link>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <Link href="/telegram" className="hover:text-primary">Protect a Telegram community</Link>
              <Link href="/contact?topic=api-pilot" className="hover:text-primary">Discuss an integration pilot</Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {trustSignals.map(([Icon, title, text]) => (
                <div key={title} className="rounded-xl border border-border bg-background/45 p-4 backdrop-blur">
                  <Icon className="mb-3 size-5 text-primary" />
                  <p className="font-medium">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel premium-card animated-border data-scan relative overflow-hidden rounded-3xl p-6 reveal-up delay-200">
            <div className="flex items-center justify-between gap-4 border-b border-border pb-5">
              <div>
                <p className="font-semibold">Tri-Proof Guard Platform</p>
                <p className="text-sm text-muted-foreground">One platform, three security outcomes</p>
              </div>
              <Badge variant="secondary" className="gap-2 border-primary/30 text-primary"><span className="pulse-dot" /> Live surfaces</Badge>
            </div>
            <div className="mt-5 grid gap-4">
              {[
                [ScanSearch, "Safer users", "ScamGuard checks risk before clicks, trust, and signatures."],
                [Radar, "Cleaner reward campaigns", "Sybil Analyst separates clear participants from coordinated or gray-zone wallets."],
                [Bot, "Protected communities", "Group Guardian brings explained threat decisions into Telegram operations."],
              ].map(([Icon, title, text]) => (
                <div key={title as string} className="rounded-2xl border border-border bg-background/55 p-5 transition-colors hover:border-primary/35 hover:bg-primary/5">
                  <div className="flex gap-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <p className="font-semibold">{title as string}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{text as string}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-primary/25 bg-primary/10 p-5">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Clear product boundary</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Developer API, signed webhooks, and Team Policies are advanced capabilities offered through selected pilot integrations until real-world usage is validated.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="personas" className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="mb-9 max-w-3xl">
          <Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">I am a...</Badge>
          <h2 className="text-gradient text-3xl font-semibold sm:text-5xl">Start with the problem you need to solve.</h2>
          <p className="mt-4 leading-7 text-muted-foreground">Choose your role and go directly to the relevant protection workflow instead of comparing unrelated product names.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {personas.map((persona) => {
            const Icon = persona.icon
            return (
              <Card key={persona.label} className="glass-panel premium-card hover-lift">
                <CardHeader>
                  <span className="mb-2 flex size-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><Icon /></span>
                  <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">{persona.label}</p>
                  <CardTitle>{persona.title}</CardTitle>
                  <CardDescription>{persona.text}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href={persona.href} className={`${buttonVariants({ variant: "outline" })} w-full`}>{persona.action}<ArrowRight data-icon="inline-end" /></Link>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <section id="solutions" className="border-y border-border bg-primary/[0.03]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="mb-10 max-w-4xl">
            <Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">Three clear solutions</Badge>
            <h2 className="text-gradient text-3xl font-semibold sm:text-5xl">One platform packaged around three customer outcomes.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">Chrome and Telegram are access channels for ScamGuard, not separate products. Advanced integration capabilities are clearly separated from validated core workflows.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {solutions.map((solution) => {
              const Icon = solution.icon
              return (
                <Card key={solution.title} className="glass-panel premium-card flex h-full flex-col">
                  <CardHeader>
                    <span className="mb-3 flex size-12 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><Icon /></span>
                    <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">{solution.eyebrow}</p>
                    <CardTitle className="text-2xl">{solution.title}</CardTitle>
                    <CardDescription className="leading-6">{solution.text}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-5">
                    <ul className="grid gap-2 text-sm">
                      {solution.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-2"><CheckCircle2 className="size-4 shrink-0 text-primary" />{feature}</li>
                      ))}
                    </ul>
                    {"advanced" in solution && solution.advanced && (
                      <Badge variant="outline" className="w-fit border-yellow-400/30 bg-yellow-400/5 text-yellow-100">Advanced capabilities · selected pilots</Badge>
                    )}
                    <div className="mt-auto grid gap-3 border-t border-border pt-5">
                      <Link href={solution.primaryHref} className={buttonVariants()}>{solution.primaryAction}<ArrowRight data-icon="inline-end" /></Link>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                        {solution.secondaryLinks.map(([label, href]) => href.startsWith("http") ? (
                          <a key={label} href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">{label}</a>
                        ) : (
                          <Link key={label} href={href} className="text-primary hover:underline">{label}</Link>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="mb-9 max-w-3xl">
          <Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">How it works</Badge>
          <h2 className="text-gradient text-3xl font-semibold sm:text-5xl">From target to defensible action.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {workflow.map(([number, title, text]) => (
            <div key={number} className="glass-panel premium-card rounded-2xl p-6">
              <span className="font-mono text-sm font-semibold text-primary">{number}</span>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="proof" className="border-y border-border bg-card/25">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="mb-9 max-w-3xl">
            <Badge variant="secondary" className="mb-4 w-fit gap-2 border-primary/30 text-primary"><Layers3 className="size-3.5" /> See it in action</Badge>
            <h2 className="text-gradient text-3xl font-semibold sm:text-5xl">Inspect working product surfaces.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">The evidence below is presented for customers and operators, not as grant-jury presentation material.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {proofCards.map((item) => {
              const Icon = item.icon
              return (
                <Card key={item.title} className="glass-panel premium-card hover-lift">
                  <CardHeader><Icon className="mb-2 size-5 text-primary" /><CardTitle>{item.title}</CardTitle><CardDescription>{item.text}</CardDescription></CardHeader>
                  <CardContent><Link href={item.href} className={`${buttonVariants({ variant: "outline" })} w-full`}>{item.action}<ArrowRight data-icon="inline-end" /></Link></CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-8 rounded-3xl border border-primary/25 bg-primary/[0.06] p-7 sm:p-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">Public validation case study</Badge>
            <h2 className="text-gradient text-3xl font-semibold sm:text-4xl">How a public wallet dataset moves through Tri-Proof decisions.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">This is a transparent product validation example, not a customer endorsement. It demonstrates the report structure while the first external pilot case study is being earned.</p>
            <Link href="/case-studies/public-demo" className={`${buttonVariants()} mt-6`}>Read the validation case study<ArrowRight data-icon="inline-end" /></Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[["20", "Wallets analyzed"], ["6", "Approved"], ["5", "Gray-zone review"], ["9", "Rejected / not eligible"]].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-border bg-background/55 p-5"><p className="text-gradient text-3xl font-semibold">{value}</p><p className="mt-1 text-sm text-muted-foreground">{label}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="mb-9 max-w-3xl">
            <Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">Choose by need</Badge>
            <h2 className="text-gradient text-3xl font-semibold sm:text-5xl">What do you need to protect?</h2>
            <p className="mt-4 leading-7 text-muted-foreground">Select your surface first. The pricing page will take you directly to the relevant access model.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {pricingChoices.map(([Icon, need, recommendation, href]) => (
              <Link key={need} href={href} className="glass-panel premium-card hover-lift rounded-2xl p-5">
                <Icon className="size-5 text-primary" />
                <p className="mt-4 font-semibold">{need}</p>
                <p className="mt-1 text-sm text-muted-foreground">Recommended: {recommendation}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">View option <ArrowRight className="size-4" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="glass-panel premium-card animated-border flex flex-col items-start justify-between gap-7 rounded-3xl p-8 sm:p-10 md:flex-row md:items-center">
          <div>
            <div className="mb-3 flex items-center gap-2 text-primary"><Sparkles className="size-5" /><span className="font-mono text-xs uppercase tracking-[0.2em]">Protect the next decision</span></div>
            <h2 className="text-gradient text-2xl font-semibold sm:text-4xl">Protect your next campaign before rewards move.</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">Run the free mini audit for an initial wallet-list review or request a limited pilot for an active campaign.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/audit" className={`${buttonVariants({ size: "lg" })} glow-primary`}>Run a free mini audit</Link>
            <Link href="/contact?topic=pilot-review" className={buttonVariants({ variant: "outline", size: "lg" })}>Request a pilot review</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-muted/20">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2"><ShieldCheck className="text-primary" /><span>Tri-Proof Protocol · Guard Platform</span></div>
          <div className="flex flex-wrap gap-4">
            <Link href="/scamguard" className="hover:text-primary">ScamGuard</Link>
            <Link href="/audit" className="hover:text-primary">Sybil Analyst</Link>
            <Link href="/telegram" className="hover:text-primary">Group Guardian</Link>
            <Link href="/extension" className="hover:text-primary">Extension</Link>
            <Link href="/pricing" className="hover:text-primary">Pricing</Link>
            <Link href="/docs" className="hover:text-primary">Docs</Link>
            <Link href="/grants" className="hover:text-primary">Grants</Link>
            <Link href="/contact" className="hover:text-primary">Contact</Link>
            <Link href="/legal" className="hover:text-primary">Trust & legal</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
