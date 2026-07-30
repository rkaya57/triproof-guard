import Image from "next/image"
import Link from "next/link"
import {
  Activity,
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  CircleDollarSign,
  Code2,
  Download,
  FileCheck2,
  FileDown,
  GitBranch,
  Globe2,
  Layers3,
  LockKeyhole,
  Mail,
  Network,
  PackageCheck,
  Puzzle,
  Radar,
  Rocket,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
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
import { analysisCreditPacks, subscriptionPlans } from "@/lib/billing/plans"
import { scamGuardTelegramBotUrl } from "@/lib/telegram/links"

const navLinks = [
  ["Product", "#product"],
  ["Grant Fit", "#grant-fit"],
  ["Demo", "#demo-proof"],
  ["ScamGuard", "/scamguard"],
  ["Docs", "/docs"],
  ["Pricing", "#pricing"],
]

const heroStats = [
  ["Live product", "scanner, API, extension"],
  ["Solana-first", "campaign + pre-sign safety"],
  ["68 checks", "automated product coverage"],
]

const consoleStats = [
  ["2", "Protection engines", "Sybil + ScamGuard"],
  ["1", "Credit per wallet", "Persistent analysis credit"],
  ["API", "Ready", "B2B integration"],
]

const trustSignals = [
  [LockKeyhole, "Privacy by design", "No seed phrase, private key, wallet password, or custody path."],
  [Activity, "Evidence-based", "Scores use domain, RPC, intent, registry, and campaign context."],
  [FileCheck2, "Explainable decisions", "Users see why a warning fired and what to verify next."],
  [ShieldCheck, "Builder-ready", "Public scanner, Chrome extension, API docs, and admin intelligence."],
]

const painPoints = [
  {
    icon: ShieldAlert,
    title: "Reward pools leak to Sybil farms",
    text: "A long wallet list does not mean real community growth. Coordinated wallets can inflate campaigns before distribution.",
  },
  {
    icon: Network,
    title: "Clusters are hard to review manually",
    text: "Shared funding sources, repeated behavior and low-activity wallets are difficult to detect in spreadsheets.",
  },
  {
    icon: FileCheck2,
    title: "Teams need defensible reward decisions",
    text: "Projects need clean lists, gray-zone queues and clear explanations before they send rewards.",
  },
  {
    icon: ShieldAlert,
    title: "Users sign risky Solana transactions",
    text: "Airdrop, mint and claim links can hide approvals, authority changes and drain-style asset movement across wallet flows.",
  },
]

const productLayers = [
  {
    icon: Radar,
    title: "Sybil Analysis",
    text: "Upload campaign wallets, detect low-quality participants, review suspicious clusters, and export clean reward lists.",
    href: "/audit",
    action: "Run mini audit",
    external: false,
  },
  {
    icon: ShieldAlert,
    title: "ScamGuard Scanner",
    text: "Scan Web3 URLs, wallets, token mints, and transaction intent across Solana and EVM before users touch risky claim or mint flows.",
    href: "/scamguard",
    action: "Open scanner",
    external: false,
  },
  {
    icon: Puzzle,
    title: "Chrome Extension",
    text: "Add page banners, link scanning, and pre-sign wallet warnings directly inside the browser session.",
    href: "/downloads/scamguard-chrome-extension.zip",
    action: "Download extension",
    external: false,
  },
  {
    icon: Send,
    title: "Telegram ScamGuard Bot",
    text: "Paste suspicious links, wallets, mints, or transaction requests into Telegram for a fast, explained ScamGuard review.",
    href: scamGuardTelegramBotUrl,
    action: "Open bot",
    external: true,
  },
  {
    icon: Code2,
    title: "B2B Security API",
    text: "Embed authenticated ScamGuard and Tri-Proof decisions into wallets, launchpads, quests, and internal review tools.",
    href: "/docs/api",
    action: "Read API docs",
    external: false,
  },
]

const grantHighlights = [
  {
    icon: Target,
    title: "Problem",
    text: "Solana campaigns attract Sybil wallets, fake reward pages, and unsafe signing prompts. Teams need protection before funds or signatures move.",
  },
  {
    icon: ShieldCheck,
    title: "Solution",
    text: "Tri-Proof Guard combines wallet eligibility review with ScamGuard pre-sign intelligence for Solana users, projects, wallets, and launchpads.",
  },
  {
    icon: Rocket,
    title: "Grant output",
    text: "A public beta with stronger Solana transaction decoding, verified project registry, extension onboarding, and partner-ready API examples.",
  },
]

const demoProof = [
  [ShieldAlert, "ScamGuard live scanner", "Run URL, wallet, token mint, and transaction intent scans from the public product page.", "/scamguard", "Open scanner"],
  [Puzzle, "Chrome extension beta", "Test live browsing protection with page link scanning, site status, and pre-sign warning profiles.", "/downloads/scamguard-chrome-extension.zip", "Download"],
  [Radar, "Sybil mini audit", "Upload campaign wallets and review risk scoring, gray-zone decisions, and export-ready outputs.", "/audit", "Run audit"],
  [Code2, "API documentation", "Review authenticated B2B scan endpoints for wallets, launchpads, dashboards, and dApps.", "/docs/api", "Read docs"],
] as const

const grantMilestones = [
  ["M1", "Solana transaction decoding", "Expand SPL Token, Token-2022, account close, delegate, authority, and serialized transaction review."],
  ["M2", "Project intelligence registry", "Ship admin-managed trusted, suspicious, and known-bad domain/spender intelligence with safer false-positive handling."],
  ["M3", "Extension public beta", "Polish onboarding, settings, warning overlays, and safe/caution/high-risk messaging for real browsing sessions."],
  ["M4", "Partner API package", "Document B2B endpoint examples, SDK usage, response schema, and integration patterns for Solana teams."],
]

const privacyPrinciples = [
  ["No private keys", "The product never asks for seed phrases, private keys, or wallet passwords."],
  ["Minimal inputs", "Scans use URLs, public addresses, transaction payloads, and optional wallet public key context."],
  ["Explainable warnings", "Every result includes score, confidence, primary reason, evidence layer, and next action."],
  ["Human override", "Admin intelligence and feedback help correct false positives without weakening real threat detection."],
]

const workflow = [
  { icon: Upload, title: "Upload wallet CSV", text: "Import campaign participants from airdrops, quests, testnets or allowlists." },
  { icon: Activity, title: "Enrich on-chain data", text: "Run real on-chain or hybrid analysis with provider evidence from supported chains." },
  { icon: Radar, title: "Detect clusters", text: "Surface suspicious groups, shared funding patterns and similar behavior." },
  { icon: ShieldAlert, title: "Scan scam risk", text: "Check suspicious Solana URLs, token mints and transaction intent before users sign." },
  { icon: FileDown, title: "Export decision lists", text: "Download approved, gray-zone and rejected/not-eligible wallet outputs." },
]

const scoringPrinciples = [
  ["Wallet history", "Age, transaction count, balances, counterparties and protocol diversity."],
  ["Funding links", "Shared funding sources, suspicious clusters and repeated wallet groups."],
  ["Campaign behavior", "Campaign-only activity, low organic history and scripted patterns."],
  ["Known entities", "Exchange, service, contract or protocol accounts are handled separately from normal users."],
]

const features = [
  "Real on-chain enrichment",
  "Multi-chain wallet analysis",
  "Wallet risk score",
  "Funding source analysis",
  "Suspicious cluster detection",
  "Behavior intelligence signals",
  "Approved / gray-zone / rejected lists",
  "CSV and PDF reporting",
  "Policy presets",
  "Solana USDC or SOL checkout",
  "ScamGuard pre-sign scanner",
  "Suspicious URL and token mint checks",
]

const useCases = [
  ["Airdrops", "Clean reward lists before token or USDC distribution."],
  ["Testnets", "Filter low-quality participants before points or whitelist allocation."],
  ["Galxe / Zealy quests", "Review wallet lists before community reward campaigns."],
  ["Scam prevention", "Scan risky Solana claim links, token mints and transaction intent before users sign."],
]

const plans = [
  {
    name: subscriptionPlans.free.name,
    price: "$0",
    credits: "Extension, Telegram Bot, basic scans",
    detail: "Everyday Web3 safety with a daily scan limit.",
    href: "/scamguard",
    cta: "Open Scanner",
  },
  {
    name: subscriptionPlans.builder.name,
    price: `$${subscriptionPlans.builder.amountUsdc}/mo`,
    credits: "History, deep URL scans, Scam DNA",
    detail: "For researchers and active Web3 users.",
    href: "/checkout?plan=builder",
    cta: "Choose Builder",
  },
  {
    name: subscriptionPlans.community.name,
    price: `$${subscriptionPlans.community.amountUsdc}/mo`,
    credits: "Telegram Group Guardian and reports",
    detail: "Protection for one active Telegram community.",
    href: "/checkout?plan=community",
    cta: "Choose Community",
    featured: true,
  },
  {
    name: subscriptionPlans.api_growth.name,
    price: `$${subscriptionPlans.api_growth.amountUsdc}/mo`,
    credits: "25,000 API requests and webhooks",
    detail: "Production-grade dApp and wallet integration.",
    href: "/checkout?plan=api_growth",
    cta: "Choose API Growth",
  },
]

const sybilCreditPacks = Object.values(analysisCreditPacks).map((pack) => ({
  ...pack,
  perWallet: (pack.amountUsdc / pack.walletCredits).toFixed(pack.walletCredits >= 50_000 ? 3 : 4),
}))

export function LandingPage() {
  return (
    <main className="premium-page min-h-screen overflow-hidden bg-background text-foreground">
      <section className="security-grid relative overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="glow-orb left-[-7rem] top-[-5rem] size-96" style={{ background: "var(--guard-cyan)" }} />
          <div className="glow-orb right-[-9rem] top-20 size-[28rem]" style={{ background: "var(--guard-purple)", animationDelay: "2s" }} />
          <div className="glow-orb bottom-[-10rem] left-1/3 size-96" style={{ background: "var(--guard-cyan)", opacity: 0.32, animationDelay: "5s" }} />
        </div>

        <header className="relative z-10 mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <span className="glow-primary flex size-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 transition-transform group-hover:scale-105">
              <Image src="/logo.svg" alt="Tri-Proof Guard" width={30} height={30} priority className="rounded-lg" />
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Tri-Proof Guard</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary/80">Wallet Risk Engine</span>
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
            <Link href="/login" className={`${buttonVariants({ variant: "outline" })} hover-lift hidden sm:inline-flex`}>Login</Link>
            <Link href="/scamguard" className={`${buttonVariants()} glow-primary hover-lift`}>Open Demo</Link>
          </div>
        </header>

        <div className="relative z-10 mx-auto grid max-w-[1500px] gap-8 px-5 pb-14 pt-8 sm:px-8 lg:grid-cols-[0.98fr_1.02fr] lg:items-center lg:pb-18 lg:pt-14">
          <div className="reveal-up flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="cyber-chip">Solana security suite</span>
                <Badge variant="secondary" className="border-primary/30 text-primary">Sybil + ScamGuard + Extension</Badge>
              </div>
              <h1 className="text-gradient animate-gradient-text max-w-3xl text-4xl font-semibold leading-[1.04] text-balance sm:text-5xl lg:text-6xl">
                Protect Solana campaigns before rewards or wallet signatures go out.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                Tri-Proof Guard gives Solana teams one safety layer for airdrop wallet review, fake claim links, risky token mints, and pre-sign transaction warnings. The live product includes ScamGuard, a Chrome extension, API docs, and Sybil analysis.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/scamguard" className={`${buttonVariants({ size: "lg" })} glow-primary hover-lift`}>Open ScamGuard <ArrowRight data-icon="inline-end" /></Link>
              <a href="/downloads/scamguard-chrome-extension.zip" className={`${buttonVariants({ variant: "outline", size: "lg" })} hover-lift`} download>
                <Download data-icon="inline-start" /> Download extension
              </a>
              <Link href="#grant-fit" className={`${buttonVariants({ variant: "outline", size: "lg" })} hover-lift`}>Grant fit</Link>
            </div>
            <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
              {heroStats.map(([value, label], index) => (
                <div key={label} className="rounded-xl border border-primary/20 bg-background/45 px-4 py-3 backdrop-blur reveal-up" style={{ animationDelay: `${index * 0.08}s` }}>
                  <p className="text-gradient text-2xl font-semibold">{value}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <div className="grid max-w-3xl gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {trustSignals.map(([Icon, title, text]) => (
                <div key={title as string} className="rounded-lg border border-border bg-background/35 p-3 backdrop-blur">
                  <Icon className="mb-2 size-4 text-primary" />
                  <p className="text-sm font-medium">{title as string}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{text as string}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel premium-card animated-border data-scan relative min-h-[430px] overflow-hidden rounded-3xl p-5 reveal-up delay-200">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div><p className="text-sm font-medium">Jury Demo Console</p><p className="text-xs text-muted-foreground">Sybil analysis and pre-sign protection</p></div>
              <Badge variant="secondary" className="gap-2 border-primary/30 text-primary"><span className="pulse-dot" /> Live product</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {consoleStats.map(([value, label, detail], index) => (
                <div key={label} className="premium-card hover-lift rounded-xl border border-border bg-background/60 p-4" style={{ animationDelay: `${index * 0.08}s` }}>
                  <p className="text-gradient text-2xl font-semibold">{value}</p><p className="text-sm text-foreground">{label}</p><p className="text-xs text-muted-foreground">{detail}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 overflow-hidden rounded-xl border border-border bg-background/50">
              <div className="grid grid-cols-[1fr_72px_86px_120px] border-b border-border bg-primary/5 px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span>Module</span><span>Signal</span><span>Mode</span><span>Output</span>
              </div>
              {[
                ["Sybil wallet list", "Graph", "Batch", "Review"],
                ["ScamGuard URL", "Domain", "Live", "Protect"],
                ["Transaction intent", "Decoded", "Pre-sign", "Warn"],
                ["Telegram Guardian", "Group", "24h", "Monitor"],
              ].map(([module, signal, mode, output], index) => (
                <div key={module} className="grid grid-cols-[1fr_72px_86px_120px] border-b border-border px-4 py-3 text-xs transition-colors last:border-b-0 hover:bg-primary/5" style={{ animationDelay: `${index * 0.08}s` }}>
                  <span className="font-mono text-muted-foreground">{module}</span><span>{signal}</span><span>{mode}</span><span className="text-primary">{output}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[[LockKeyhole, "No token required"], [CircleDollarSign, "USDC or SOL"], [Layers3, "Batch queue ready"]].map(([Icon, label]) => (
                <div key={label as string} className="flex items-center gap-2 rounded-xl border border-border bg-background/45 px-3 py-2 text-xs text-muted-foreground">
                  <Icon className="size-4 text-primary" /><span>{label as string}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="mb-8 max-w-3xl">
          <Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">Product suite</Badge>
          <h2 className="text-gradient text-3xl font-semibold sm:text-5xl">
            One Solana security layer for campaigns, claims, and signing moments.
          </h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            The product is built around the points where Web3 teams lose value: fake campaign wallets, unsafe claim links, risky token mints, and wallet popups users do not fully understand.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          {productLayers.map((layer) => {
            const Icon = layer.icon
            return (
              <Card key={layer.title} className="glass-panel premium-card hover-lift">
                <CardHeader>
                  <span className="glow-primary mb-2 flex size-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                    <Icon />
                  </span>
                  <CardTitle>{layer.title}</CardTitle>
                  <CardDescription>{layer.text}</CardDescription>
                </CardHeader>
                <CardContent>
                  {layer.href.startsWith("/downloads/") ? (
                    <a href={layer.href} className={`${buttonVariants({ variant: "outline" })} hover-lift w-full`} download>
                      <Download data-icon="inline-start" /> {layer.action}
                    </a>
                  ) : layer.external ? (
                    <a href={layer.href} target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: "outline" })} hover-lift w-full`}>
                      {layer.action} <ArrowRight data-icon="inline-end" />
                    </a>
                  ) : (
                    <Link href={layer.href} className={`${buttonVariants({ variant: "outline" })} hover-lift w-full`}>
                      {layer.action} <ArrowRight data-icon="inline-end" />
                    </Link>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <section id="grant-fit" className="border-y border-border bg-primary/[0.03]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="mb-10 grid gap-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
            <div>
              <Badge variant="secondary" className="mb-4 w-fit gap-2 border-primary/30 text-primary">
                <Award className="size-3.5" /> Grant-ready scope
              </Badge>
              <h2 className="text-gradient text-3xl font-semibold sm:text-5xl">
                A focused Solana security grant, with a working prototype already live.
              </h2>
            </div>
            <p className="leading-7 text-muted-foreground">
              The grant story is simple: reduce user loss and campaign waste in the Solana ecosystem. The current product already demonstrates the scanner, extension, API, and wallet-list review flow; grant funding turns it into a stronger public beta.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {grantHighlights.map((item) => {
              const Icon = item.icon
              return (
                <Card key={item.title} className="glass-panel premium-card hover-lift">
                  <CardHeader>
                    <span className="mb-3 flex size-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                      <Icon />
                    </span>
                    <CardTitle>{item.title}</CardTitle>
                    <CardDescription>{item.text}</CardDescription>
                  </CardHeader>
                </Card>
              )
            })}
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[0.88fr_1.12fr]">
            <Card className="glass-panel premium-card">
              <CardHeader>
                <CardTitle>Why Solana Foundation Turkey Grants fits</CardTitle>
                <CardDescription>
                  ScamGuard protects the exact consumer flows that bring new users into Solana: airdrops, quests, mints, token claims, and campaign reward pages.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm text-muted-foreground">
                {[
                  "Solana-first UX: Phantom/Backpack context, SPL token heuristics, and Solana transaction review.",
                  "Public-good angle: fewer fake claim links, fewer unsafe signatures, cleaner campaign incentives.",
                  "Builder utility: API and extension can be reused by wallets, launchpads, quests, and Turkish Solana teams.",
                  "Measurable output: public beta, documented endpoints, verified project registry, and testable demo flows.",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-lg border border-border bg-background/45 p-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="glass-panel premium-card animated-border">
              <CardHeader>
                <CardTitle>Proposed grant milestones</CardTitle>
                <CardDescription>Concrete deliverables that a reviewer can evaluate without guessing.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {grantMilestones.map(([phase, title, text]) => (
                  <div key={phase} className="grid gap-3 rounded-lg border border-border bg-background/45 p-4 sm:grid-cols-[54px_1fr]">
                    <span className="flex size-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 font-mono text-xs font-semibold text-primary">
                      {phase}
                    </span>
                    <div>
                      <p className="font-semibold text-white">{title}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="demo-proof" className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="secondary" className="mb-4 w-fit gap-2 border-primary/30 text-primary">
              <PackageCheck className="size-3.5" /> Demo proof
            </Badge>
            <h2 className="text-gradient text-3xl font-semibold sm:text-4xl">Everything a reviewer should click first.</h2>
          </div>
          <p className="max-w-xl text-muted-foreground">
            The site now routes the jury directly to working surfaces instead of asking them to infer the product from a roadmap.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {demoProof.map(([Icon, title, text, href, action]) => (
            <Card key={title} className="glass-panel premium-card hover-lift">
              <CardHeader>
                <Icon className="mb-2 size-5 text-primary" />
                <CardTitle>{title}</CardTitle>
                <CardDescription>{text}</CardDescription>
              </CardHeader>
              <CardContent>
                {href.endsWith(".zip") ? (
                  <a href={href} className={`${buttonVariants({ variant: "outline" })} hover-lift w-full`} download>
                    <Download data-icon="inline-start" /> {action}
                  </a>
                ) : (
                  <Link href={href} className={`${buttonVariants({ variant: "outline" })} hover-lift w-full`}>
                    {action} <ArrowRight data-icon="inline-end" />
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-16 sm:px-8 lg:grid-cols-4">
        {painPoints.map((item, index) => (
          <Card key={item.title} className="glass-panel premium-card hover-lift reveal-up" style={{ animationDelay: `${index * 0.1}s` }}>
            <CardHeader><item.icon className="text-destructive" /><CardTitle>{item.title}</CardTitle><CardDescription>{item.text}</CardDescription></CardHeader>
          </Card>
        ))}
      </section>

      <section className="border-y border-border bg-muted/20">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 xl:grid-cols-[0.85fr_1.15fr] xl:items-start">
          <div>
            <Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">Scoring trust</Badge>
            <h2 className="text-gradient text-3xl font-semibold sm:text-4xl">A clearer score, not a black-box verdict.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Mini audit results are framed as campaign risk decisions. Approved wallets look clean enough for export, Gray Zone wallets need a human call, and rejected wallets carry explainable risk evidence.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Badge variant="outline" className="border-green-400/30 text-green-200">Approved</Badge>
              <Badge variant="outline" className="border-amber-400/30 text-amber-200">Gray Zone</Badge>
              <Badge variant="outline" className="border-red-400/30 text-red-200">Rejected / Not Eligible</Badge>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {scoringPrinciples.map(([title, text]) => (
              <div key={title} className="premium-card rounded-lg border border-border bg-background/60 p-5">
                <p className="font-semibold text-white">{title}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <div>
            <Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">Security posture</Badge>
            <h2 className="text-gradient text-3xl font-semibold sm:text-4xl">Useful protection without asking users to trust another wallet app.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Tri-Proof Guard works as a pre-sign and campaign-review layer. It explains risk before action, while keeping custody and secret material out of scope.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {privacyPrinciples.map(([title, text]) => (
              <div key={title} className="premium-card rounded-lg border border-border bg-card/70 p-5">
                <LockKeyhole className="mb-4 size-5 text-primary" />
                <p className="font-semibold text-white">{title}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="border-y border-border bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div><Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">Operator workflow</Badge><h2 className="text-gradient text-3xl font-semibold sm:text-4xl">From raw wallet CSV to cleaner reward list.</h2></div>
            <p className="max-w-xl text-muted-foreground">The product is decision support, not identity certification. Your team keeps the final decision.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-5">
            {workflow.map((step, index) => (
              <Card key={step.title} className="glass-panel premium-card hover-lift group relative overflow-hidden">
                <span className="pointer-events-none absolute right-3 top-2 font-mono text-5xl font-bold text-primary/10 transition-colors group-hover:text-primary/20">{String(index + 1).padStart(2, "0")}</span>
                <CardHeader><span className="glow-primary mb-2 flex size-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary transition-transform group-hover:scale-110"><step.icon /></span><CardTitle className="text-base">{step.title}</CardTitle><CardDescription>{step.text}</CardDescription></CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">Guard engine</Badge>
            <h2 className="text-gradient text-3xl font-semibold sm:text-4xl">Built for campaign teams, not generic analytics dashboards.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">Tri-Proof Guard focuses on one job: help Web3 projects review wallet lists before rewards go out. It returns signals, clusters and suggested actions without making impossible &quot;100% detection&quot; claims.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/docs" className={`${buttonVariants({ variant: "outline" })} hover-lift`}><BookOpen data-icon="inline-start" /> How it works</Link>
              <Link href="/contact" className={`${buttonVariants({ variant: "outline" })} hover-lift`}><Mail data-icon="inline-start" /> Contact us</Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {features.map((feature) => (
              <div key={feature} className="premium-card hover-lift flex items-center gap-3 rounded-lg border border-border bg-card/70 px-4 py-3 transition-colors hover:border-primary/45 hover:bg-primary/5"><CheckCircle2 className="text-primary" /><span className="text-sm">{feature}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="mb-8 flex flex-col gap-3"><Badge variant="secondary" className="w-fit gap-2 border-primary/30 text-primary"><WalletCards className="size-3.5" />Use cases</Badge><h2 className="text-gradient text-3xl font-semibold sm:text-4xl">Useful anywhere wallets compete for rewards.</h2></div>
          <div className="grid gap-5 md:grid-cols-4">
            {useCases.map(([title, text]) => (<Card key={title} className="glass-panel premium-card hover-lift"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{text}</CardDescription></CardHeader></Card>))}
          </div>
        </div>
      </section>

      <section id="pricing" className="security-grid relative overflow-hidden border-y border-border bg-card/20">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div><Badge variant="secondary" className="mb-4 w-fit gap-2 border-primary/30 text-primary"><WalletCards className="size-3.5" />ScamGuard access + Sybil analysis</Badge><h2 className="text-gradient text-3xl font-semibold sm:text-4xl">Start free. Add protection access or wallet-analysis capacity as you grow.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">ScamGuard plans are 30-day access passes. Sybil packs are separate one-time wallet credits. Every amount is fixed in USDC or shown as a live SOL equivalent before a wallet opens.</p></div>
          <Link href="/pricing" className={`${buttonVariants({ variant: "outline" })} hover-lift w-fit`}>Full pricing <ArrowRight data-icon="inline-end" /></Link>
        </div>
        <div className="mb-8 grid gap-4 md:grid-cols-2">
          <a href="#scamguard-access" className="group rounded-lg border border-primary/35 bg-primary/10 p-5 transition-colors hover:bg-primary/15"><p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Product 01</p><div className="mt-2 flex items-end justify-between gap-4"><div><p className="text-xl font-semibold">ScamGuard access</p><p className="mt-1 text-sm text-muted-foreground">Scanner, extension, bot, API, and Group Guardian.</p></div><span className="text-sm font-medium text-primary">$0 - $79</span></div></a>
          <a href="#sybil-credits" className="group rounded-lg border border-primary/35 bg-primary/10 p-5 transition-colors hover:bg-primary/15"><p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Product 02</p><div className="mt-2 flex items-end justify-between gap-4"><div><p className="text-xl font-semibold">Sybil wallet credits</p><p className="mt-1 text-sm text-muted-foreground">One credit equals one campaign wallet analyzed.</p></div><span className="text-sm font-medium text-primary">$29 - $249</span></div></a>
        </div>
        <div id="scamguard-access" className="grid gap-5 scroll-mt-8 md:grid-cols-4">
          {plans.map((plan) => { const featured = "featured" in plan && plan.featured; return <Card key={plan.name} className={`glass-panel premium-card hover-lift relative overflow-hidden ${featured ? "border-primary/60 bg-primary/10 shadow-[0_0_36px_rgba(56,189,248,0.15)]" : ""}`}>
            {featured && <Badge className="absolute right-4 top-4 bg-primary text-primary-foreground">Most selected</Badge>}
            <CardHeader><CardTitle>{plan.name}</CardTitle><CardDescription>{plan.detail}</CardDescription></CardHeader><CardContent className="flex flex-col gap-5"><div><p className="text-gradient text-2xl font-semibold">{plan.price}</p><p className="mt-1 text-xs text-muted-foreground">{plan.credits}</p></div><div className="flex items-center justify-between gap-3 border-t border-border pt-4"><span className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 text-primary" />{plan.name === "Free" ? "No payment required" : "USDC or SOL"}</span><Link href={plan.href} className={`${buttonVariants({ variant: featured || plan.name === "Free" ? "default" : "outline" })} hover-lift`}>{plan.cta}<ArrowRight data-icon="inline-end" /></Link></div></CardContent></Card> })}
        </div>
        <div id="sybil-credits" className="mt-10 scroll-mt-8 border-t border-border pt-8">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Sybil campaign credits</p><h3 className="mt-2 text-2xl font-semibold">One-time wallet analysis packs.</h3><p className="mt-2 max-w-2xl text-sm text-muted-foreground">One credit analyzes one campaign wallet. Credits persist until used; no subscription or automatic renewal.</p></div><Link href="/pricing" className={`${buttonVariants({ variant: "outline", size: "sm" })} w-fit`}>Compare packs <ArrowRight data-icon="inline-end" /></Link></div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">{sybilCreditPacks.map((pack) => <div key={pack.id} className="rounded-lg border border-border bg-background/45 p-5"><p className="font-semibold">{pack.name}</p><p className="mt-2 text-2xl font-semibold text-primary">{pack.amountUsdc} USDC</p><p className="mt-1 text-xs text-muted-foreground">{pack.walletCredits.toLocaleString()} wallet credits</p><div className="mt-4 flex items-center justify-between border-t border-border pt-4"><span className="text-sm text-muted-foreground">{pack.perWallet} USDC / wallet</span><Link href={`/checkout?pack=${pack.id}`} className="text-sm font-medium text-primary hover:underline">Choose pack</Link></div></div>)}</div>
        </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="mb-8 flex flex-col gap-3"><Badge variant="secondary" className="w-fit gap-2 border-primary/30 text-primary"><GitBranch className="size-3.5" />Roadmap</Badge><h2 className="text-gradient text-3xl font-semibold sm:text-4xl">Built in layers, without forcing a native token.</h2></div>
          <div className="grid gap-4 md:grid-cols-3">
            {[["Guard Product", "On-chain wallet enrichment, risk score, cluster review and PDF/CSV exports."], ["ScamGuard Solana", "Suspicious URL, token mint, wallet and transaction intent scanner for pre-sign protection."], ["Guard Pro", "Saved decisions, team review workflow, API access and repeat campaign monitoring."]].map(([phase, detail], index) => (<div key={phase} className="glass-panel premium-card hover-lift rounded-lg p-5"><span className="cyber-chip mb-3">Phase {index + 1}</span><p className="mt-1 font-semibold">{phase}</p><p className="mt-3 text-sm leading-6 text-muted-foreground">{detail}</p></div>))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="glass-panel scan-accent premium-card animated-border relative flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl p-8 sm:p-10 md:flex-row md:items-center">
          <div className="relative z-10"><div className="mb-3 flex items-center gap-2 text-primary"><Sparkles className="size-5" /><span className="font-mono text-xs uppercase tracking-[0.2em]">Live product</span></div><h2 className="text-gradient text-2xl font-semibold sm:text-3xl">Test the first 100 wallets free today.</h2><p className="mt-2 max-w-xl text-muted-foreground">Upload a CSV, review risk signals and see whether Tri-Proof Guard fits your Web3 campaign workflow.</p></div>
          <div className="relative z-10 flex flex-col gap-3 sm:flex-row"><Link href="/audit" className={`${buttonVariants()} glow-primary hover-lift`}>Start mini audit</Link><Link href="/scamguard" className={`${buttonVariants({ variant: "outline" })} hover-lift`}><Globe2 data-icon="inline-start" /> Open ScamGuard</Link><Link href="/contact" className={`${buttonVariants({ variant: "outline" })} hover-lift`}>Contact</Link></div>
        </div>
      </section>

      <footer className="border-t border-border bg-muted/20">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-sm text-muted-foreground sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2"><ShieldCheck className="text-primary" /><span>Tri-Proof Guard - Web3 wallet risk analysis for campaign teams.</span></div>
          <div className="flex flex-wrap gap-4"><Link href="/docs" className="hover:text-primary">Docs</Link><Link href="/blog" className="hover:text-primary">Blog</Link><a href={scamGuardTelegramBotUrl} target="_blank" rel="noreferrer" className="hover:text-primary">Telegram Bot</a><Link href="/contact" className="hover:text-primary">Contact</Link><Link href="/pricing" className="hover:text-primary">Pricing</Link><Link href="/demo/report" className="hover:text-primary">Demo</Link><Link href="/login" className="hover:text-primary">Login</Link></div>
        </div>
      </footer>
    </main>
  )
}
