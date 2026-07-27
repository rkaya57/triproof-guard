import Image from "next/image"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  Code2,
  DatabaseZap,
  FileDown,
  FileSearch,
  Gauge,
  GitBranch,
  Globe2,
  KeyRound,
  Landmark,
  Layers3,
  LockKeyhole,
  Mail,
  Network,
  PlugZap,
  Radar,
  SearchCheck,
  ServerCog,
  ShieldAlert,
  ShieldQuestion,
  SlidersHorizontal,
  UploadCloud,
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

export const metadata = {
  title: "How Tri-Proof Guard Works | Web3 Wallet Risk Analysis",
  description:
    "A complete guide to Tri-Proof Guard: Sybil analysis, ScamGuard pre-sign protection, risk scoring, evidence layers, API integration, reports, and operational review workflows.",
}

const navLinks = [
  ["Home", "/"],
  ["Trust", "/docs/trust"],
  ["API", "/docs/api"],
  ["Pricing", "/pricing"],
  ["Contact", "/contact"],
]

const pageAnchors = [
  ["Overview", "#overview"],
  ["Workflow", "#workflow"],
  ["Evidence", "#evidence"],
  ["ScamGuard", "#scamguard"],
  ["Results", "#results"],
  ["Operations", "#operations"],
  ["FAQ", "#faq"],
]

const workflow = [
  {
    icon: UploadCloud,
    title: "Upload or paste campaign wallets",
    text: "Start with a CSV, manual wallet list, or public mini audit sample from an airdrop, quest, testnet, allowlist, loyalty campaign, or rewards program.",
  },
  {
    icon: DatabaseZap,
    title: "Normalize and validate rows",
    text: "The engine removes duplicates, separates invalid rows, detects chain context, and keeps parse issues visible so teams know exactly what was accepted.",
  },
  {
    icon: ServerCog,
    title: "Collect provider evidence",
    text: "When providers are configured, Tri-Proof Guard enriches wallets with account age, balances, token activity, signatures, owner programs, and contract context.",
  },
  {
    icon: BrainCircuit,
    title: "Score behavior and reputation",
    text: "Signals are weighted through strict, balanced, or conservative policy modes instead of relying on a single weak rule.",
  },
  {
    icon: Network,
    title: "Group suspicious clusters",
    text: "Shared funding sources, similar account behavior, low diversity, and repeated campaign-only activity are surfaced as review groups.",
  },
  {
    icon: FileDown,
    title: "Export decisions and evidence",
    text: "Teams can review approved, Gray Zone, and rejected outputs, then export CSV or report data for reward operations and internal audit trails.",
  },
]

const productLayers = [
  {
    icon: WalletCards,
    title: "Sybil wallet analysis",
    text: "Reviews campaign wallet lists before rewards are distributed. It focuses on eligibility, suspicious clusters, known entities, low-quality wallets, and decision exports.",
  },
  {
    icon: ShieldAlert,
    title: "ScamGuard pre-sign protection",
    text: "Checks URLs, wallets, token mints, contracts, and transaction intent before a user clicks or signs. It is built for browser extension, API, and partner app flows.",
  },
  {
    icon: SlidersHorizontal,
    title: "Admin intelligence console",
    text: "Lets the team manage trusted domains, suspicious domains, known bad spenders, verified projects, and override decisions without changing code.",
  },
  {
    icon: Code2,
    title: "API and partner integration",
    text: "Wallets, launchpads, campaign platforms, and dApps can call authenticated endpoints to receive consistent ScamGuard and wallet-risk decisions.",
  },
]

const signals = [
  [WalletCards, "Wallet age", "Newly created wallets are reviewed more carefully when combined with weak history, low balance, or campaign-only behavior."],
  [Radar, "Transaction history", "Low activity, thin signature history, repetitive actions, and missing organic usage reduce confidence."],
  [Network, "Funding source", "Groups funded from the same origin can indicate farming, managed wallets, or reward leakage risk."],
  [Layers3, "Contract diversity", "The engine checks whether wallets show broad real usage or narrow one-purpose interaction patterns."],
  [Landmark, "Known entities", "Exchange, bridge, service, token mint, protocol, and program-owned accounts are marked for review or exclusion."],
  [GitBranch, "Suspicious clusters", "Related wallets are grouped so reviewers can inspect patterns across the list instead of one address at a time."],
  [Globe2, "Domain reputation", "ScamGuard separates verified project domains from disposable claim, airdrop, mint, and reward lookalike domains."],
  [LockKeyhole, "Signing intent", "Transaction payloads are checked for approvals, authority changes, transfers, close-account actions, and suspicious spenders."],
  [KeyRound, "Contract intelligence", "EVM scans can inspect bytecode, verification, proxy shape, and deployer or spender reputation when API keys are configured."],
]

const evidenceLayers = [
  ["Input quality", "Duplicate rows, invalid addresses, chain mismatch, CSV parsing errors, and row-level exclusions."],
  ["On-chain account state", "Age, balance, token holdings, owner program, transaction count, and sampled historical activity."],
  ["Behavioral signals", "Funding concentration, campaign-only usage, low diversity, similar timing, and repeated wallet patterns."],
  ["Reputation intelligence", "Trusted project domains, suspicious surfaces, known bad counterparties, verified mints, and admin overrides."],
  ["Transaction semantics", "Human-readable interpretation of approval, transfer, authority, and contract interaction intent."],
  ["Reviewer context", "Primary reason, confidence, risk drivers, next action, and limitations behind the decision."],
]

const scamguardFlow = [
  [SearchCheck, "Classify the surface", "URL, wallet, token mint, contract address, serialized transaction, or wallet request JSON is routed to the right scanner."],
  [Globe2, "Check source context", "Domain patterns, trusted registries, suspicious TLDs, and project intelligence are evaluated together."],
  [ClipboardCheck, "Decode intent", "The engine explains what the request appears to do before the user signs it."],
  [Gauge, "Score and explain", "The result includes risk level, confidence, security score, primary reason, and recommended actions."],
  [PlugZap, "Protect where users act", "The same engine powers the public scanner, Chrome extension, and B2B API endpoint."],
]

const outcomes = [
  {
    title: "Approved",
    tone: "border-green-400/30 bg-green-400/10 text-green-300",
    text: "No major risk pattern was detected from the available evidence. The wallet can be considered a candidate for automatic inclusion, subject to project policy.",
  },
  {
    title: "Gray Zone",
    tone: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    text: "The wallet or interaction needs human review because one or more signals require context. This is the right bucket for uncertain but not clearly malicious cases.",
  },
  {
    title: "Rejected / Not Eligible",
    tone: "border-red-400/30 bg-red-400/10 text-red-300",
    text: "The wallet is high-risk, inactive, protocol-owned, unreadable, clustered, or otherwise unsuitable for automatic reward distribution.",
  },
  {
    title: "Critical / Block",
    tone: "border-red-500/40 bg-red-500/10 text-red-200",
    text: "ScamGuard uses this for dangerous pre-sign situations such as known scam domains, unlimited approvals to risky spenders, or authority-changing transactions.",
  },
]

const apiTouchpoints = [
  ["POST /api/audit/mini", "Public engine preview for wallet lists and fast demo flows."],
  ["POST /api/scamguard/scan-url", "Scan a claim, mint, reward, presale, or suspicious Web3 URL."],
  ["POST /api/scamguard/scan-token", "Check token mint or contract context before interaction."],
  ["POST /api/scamguard/scan-transaction", "Decode Solana instruction text, serialized payloads, or EVM wallet request JSON."],
  ["POST /api/v1/scamguard/scan", "Authenticated partner endpoint for wallets, launchpads, extensions, and dApps."],
  ["POST /api/v1/analyze", "Authenticated wallet-list analysis entrypoint for campaign teams."],
]

const operatingModes = [
  ["Mini Audit", "Fast public preview", "Best for first look, sales demos, and quick campaign triage."],
  ["Dashboard Analysis", "Saved project workflow", "Best for full wallet-list review, team decisions, exports, and repeat operations."],
  ["ScamGuard Scanner", "Pre-click and pre-sign safety", "Best for suspicious URLs, mints, wallets, and transaction payloads."],
  ["Chrome Extension", "Live browser protection", "Best for users who want warnings directly on Web3 app pages."],
  ["B2B API", "Embedded security layer", "Best for wallets, launchpads, and campaign platforms that need automated risk checks."],
]

const reviewChecklist = [
  "Confirm the official project domain and social channels.",
  "Check whether the wallet action matches the user intent.",
  "Review Gray Zone clusters before sending rewards.",
  "Compare token mints, spender addresses, and program IDs with official docs.",
  "Export clean, review, and rejected lists before the final distribution.",
  "Treat every score as decision support, not an identity claim.",
]

const limitations = [
  "A clean score does not guarantee safety; it means no major risk signal was found from available evidence.",
  "A cluster is a review signal, not proof that the same person controls every wallet.",
  "Provider limits, RPC availability, and missing historical data can reduce confidence.",
  "Trusted project context can reduce false positives, but it should never hide dangerous transaction intent.",
]

const faqs = [
  [
    "Is Tri-Proof Guard only for Solana?",
    "The campaign-risk product is Solana-first, but ScamGuard already supports Solana and EVM surfaces. EVM coverage includes URL scans, transaction intent, approval payloads, contract context, and spender intelligence.",
  ],
  [
    "Why do verified projects sometimes receive caution?",
    "Because project reputation and transaction safety are separate. A real project can still ask for a risky approval, and an unknown page can still be harmless. Tri-Proof Guard explains which part caused the warning.",
  ],
  [
    "Does Tri-Proof Guard make the final reward decision?",
    "No. It provides operational decision support. The final inclusion, rejection, or manual-review decision remains with the project team.",
  ],
  [
    "Can reports be exported?",
    "Yes. The full dashboard supports decision-oriented exports. The public sample report also shows how approved, Gray Zone, and rejected rows are explained.",
  ],
  [
    "What should a user do when ScamGuard warns?",
    "Slow down, verify the official source, compare the wallet popup with the expected action, and avoid signing if the transaction asks for unexpected approvals or authority changes.",
  ],
  [
    "How does the system improve over time?",
    "Admin intelligence, verified domains, threat feeds, user feedback, contract intelligence, and new decode rules can be added without changing the core user flow.",
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

        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
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
          <Link href="/scamguard" className={`${buttonVariants()} glow-primary hover-lift`}>Open Demo</Link>
        </header>

        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:pb-24 lg:pt-20">
          <div className="reveal-up flex flex-col gap-7">
            <div className="flex flex-wrap items-center gap-3">
              <span className="cyber-chip">Complete product documentation</span>
              <Badge variant="secondary" className="border-primary/30 text-primary">Solana-first security layer</Badge>
            </div>
            <h1 className="text-gradient animate-gradient-text max-w-4xl text-4xl font-semibold leading-tight text-balance sm:text-6xl lg:text-7xl">
              Understand every Tri-Proof Guard decision.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Tri-Proof Guard helps Web3 teams review campaign wallet lists, reduce reward leakage, and protect users before risky wallet signatures. This guide explains the full product layer: Sybil analysis, ScamGuard, evidence scoring, admin intelligence, exports, and API integration.
            </p>
            <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
              {[
                ["Sybil review", "campaign wallet lists"],
                ["ScamGuard", "pre-sign protection"],
                ["API ready", "partner integrations"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-lg border border-primary/20 bg-background/45 px-4 py-3 backdrop-blur">
                  <p className="text-xl font-semibold text-white">{value}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/audit" className={`${buttonVariants({ size: "lg" })} glow-primary hover-lift`}>Run a mini audit <ArrowRight data-icon="inline-end" /></Link>
              <Link href="/demo/report" className={`${buttonVariants({ variant: "outline", size: "lg" })} hover-lift`}>Open demo report</Link>
              <Link href="/docs/api" className={`${buttonVariants({ variant: "outline", size: "lg" })} hover-lift`}>API docs</Link>
            </div>
          </div>

          <div className="glass-panel premium-card animated-border data-scan relative min-h-[520px] overflow-hidden rounded-3xl p-5 reveal-up delay-200">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Decision map</p>
                <p className="text-xs text-muted-foreground">From raw input to operational output</p>
              </div>
              <Badge variant="secondary" className="gap-2 border-primary/30 text-primary"><span className="pulse-dot" /> Live guide</Badge>
            </div>
            <div className="space-y-4">
              {workflow.slice(0, 5).map((step, index) => {
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

      <section className="sticky top-0 z-20 border-b border-border bg-background/82 backdrop-blur">
        <div className="mx-auto flex max-w-7xl gap-3 overflow-x-auto px-5 py-3 text-sm sm:px-8">
          {pageAnchors.map(([label, href]) => (
            <a key={href} href={href} className="shrink-0 rounded-lg border border-border bg-card/60 px-3 py-2 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
              {label}
            </a>
          ))}
        </div>
      </section>

      <section id="overview" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div className="reveal-up">
            <span className="cyber-chip">What it solves</span>
            <h2 className="text-gradient mt-5 text-3xl font-semibold sm:text-5xl">One security story for campaigns and wallet actions.</h2>
            <p className="mt-5 leading-7 text-muted-foreground">
              Web3 teams face two related problems: fake or low-quality wallets can drain campaign rewards, and users can be pushed into unsafe claim, mint, approval, or wallet-signing flows. Tri-Proof Guard connects both surfaces into one review layer so the team can make better decisions before value moves.
            </p>
            <p className="mt-4 leading-7 text-muted-foreground">
              The product is built around explainability. Every warning should answer five questions: what was scanned, what evidence was available, what risk drivers appeared, what the system recommends, and what would make the action safer.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {productLayers.map((layer, index) => {
              const Icon = layer.icon
              return (
                <Card key={layer.title} className="glass-panel premium-card hover-lift reveal-up" style={{ animationDelay: `${index * 0.08}s` }}>
                  <CardHeader>
                    <Icon className="text-primary" />
                    <CardTitle>{layer.title}</CardTitle>
                    <CardDescription>{layer.text}</CardDescription>
                  </CardHeader>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      <section id="workflow" className="border-y border-border bg-primary/[0.03]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
          <div className="mb-10 max-w-3xl">
            <span className="cyber-chip">Workflow</span>
            <h2 className="text-gradient mt-5 text-3xl font-semibold sm:text-5xl">How a wallet list becomes a decision list.</h2>
            <p className="mt-4 text-muted-foreground">
              The workflow is designed for campaign operators: upload, enrich, inspect, decide, export, and keep enough evidence to defend the decision later.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workflow.map((step, index) => {
              const Icon = step.icon
              return (
                <Card key={step.title} className="glass-panel premium-card hover-lift reveal-up" style={{ animationDelay: `${index * 0.06}s` }}>
                  <CardHeader>
                    <div className="mb-2 flex items-center justify-between">
                      <Icon className="text-primary" />
                      <span className="font-mono text-xs text-primary/80">{String(index + 1).padStart(2, "0")}</span>
                    </div>
                    <CardTitle>{step.title}</CardTitle>
                    <CardDescription>{step.text}</CardDescription>
                  </CardHeader>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      <section id="evidence" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
        <div className="mb-10 grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
          <div>
            <span className="cyber-chip">Evidence model</span>
            <h2 className="text-gradient mt-5 text-3xl font-semibold sm:text-5xl">Risk is built from layers, not one shortcut.</h2>
          </div>
          <p className="leading-7 text-muted-foreground">
            A good security product should avoid both extremes: calling every unknown project dangerous, or trusting every branded page blindly. Tri-Proof Guard weighs wallet evidence, domain evidence, transaction evidence, and reviewer context separately.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {evidenceLayers.map(([title, text], index) => (
            <div key={title} className="grid gap-3 rounded-lg border border-border bg-card/70 p-5 sm:grid-cols-[42px_1fr]">
              <span className="flex size-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 font-mono text-xs text-primary">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="font-semibold text-white">{title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {signals.map(([Icon, title, text], index) => (
            <Card key={title as string} className="glass-panel premium-card hover-lift reveal-up" style={{ animationDelay: `${index * 0.04}s` }}>
              <CardHeader>
                <Icon className="text-primary" />
                <CardTitle>{title as string}</CardTitle>
                <CardDescription>{text as string}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section id="scamguard" className="border-y border-border bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <div>
              <span className="cyber-chip">ScamGuard</span>
              <h2 className="text-gradient mt-5 text-3xl font-semibold sm:text-5xl">Pre-sign protection for the moment users are most exposed.</h2>
              <p className="mt-5 leading-7 text-muted-foreground">
                ScamGuard is the user-facing risk layer. It can scan the current page, every visible link, token mints, wallets, EVM contract targets, and transaction payloads. It is useful for browser extension protection, partner APIs, and internal project support workflows.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/scamguard" className={`${buttonVariants()} glow-primary hover-lift`}>Open ScamGuard</Link>
                <a href="/downloads/scamguard-chrome-extension.zip" className={`${buttonVariants({ variant: "outline" })} hover-lift`} download>
                  Download extension
                </a>
              </div>
            </div>
            <div className="grid gap-3">
              {scamguardFlow.map(([Icon, title, text], index) => (
                <div key={title as string} className="flex gap-4 rounded-lg border border-border bg-background/55 p-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-white">{index + 1}. {title as string}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{text as string}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="results" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
          <div className="glass-panel premium-card animated-border rounded-3xl p-6 reveal-up">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="font-medium">Decision outputs</p>
                <p className="text-sm text-muted-foreground">Simple labels for complex evidence</p>
              </div>
              <FileSearch className="text-primary" />
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
            <h2 className="text-gradient mt-5 text-3xl font-semibold sm:text-5xl">The score prioritizes review; the explanation guides action.</h2>
            <p className="mt-5 leading-7 text-muted-foreground">
              A numeric score is useful for sorting, but it is not enough for an operator. Tri-Proof Guard pairs every result with a primary reason, confidence level, risk drivers, and next step so the reviewer understands why the score exists.
            </p>
            <div className="mt-6 grid gap-3">
              {reviewChecklist.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="operations" className="border-y border-border bg-primary/[0.03]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
          <div className="mb-10 max-w-3xl">
            <span className="cyber-chip">Operations and integration</span>
            <h2 className="text-gradient mt-5 text-3xl font-semibold sm:text-5xl">Use it as a dashboard, scanner, extension, or API.</h2>
            <p className="mt-4 text-muted-foreground">
              Different teams need different surfaces. The product keeps the same decision language across public demos, full analyses, browser protection, and partner integrations.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            {operatingModes.map(([name, mode, text]) => (
              <Card key={name} className="glass-panel premium-card">
                <CardHeader>
                  <CardTitle className="text-base">{name}</CardTitle>
                  <CardDescription>{mode}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">{text}</CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <Card className="glass-panel premium-card">
              <CardHeader>
                <BookOpen className="text-primary" />
                <CardTitle>API touchpoints</CardTitle>
                <CardDescription>Core endpoints that power the public product and partner integration story.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {apiTouchpoints.map(([endpoint, text]) => (
                  <div key={endpoint} className="rounded-lg border border-border bg-background/45 p-3">
                    <p className="font-mono text-xs text-primary">{endpoint}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="glass-panel premium-card">
              <CardHeader>
                <ShieldQuestion className="text-primary" />
                <CardTitle>Known limitations</CardTitle>
                <CardDescription>Professional security tools should state uncertainty clearly.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {limitations.map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm leading-6 text-muted-foreground">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />
                    <span>{item}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
        <div className="mb-8 max-w-3xl">
          <span className="cyber-chip">FAQ</span>
          <h2 className="text-gradient mt-5 text-3xl font-semibold sm:text-5xl">Common product questions.</h2>
          <p className="mt-4 text-muted-foreground">
            These are the questions a project team, grant reviewer, wallet partner, or security reviewer is most likely to ask first.
          </p>
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
          <h2 className="text-gradient text-3xl font-semibold">Ready to test the product?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Start with the public mini audit, open the ScamGuard scanner, or contact the team for a project-specific campaign review.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/audit" className={`${buttonVariants({ size: "lg" })} glow-primary hover-lift`}>Start mini audit</Link>
            <Link href="/scamguard" className={`${buttonVariants({ variant: "outline", size: "lg" })} hover-lift`}>Open ScamGuard</Link>
            <Link href="/contact" className={`${buttonVariants({ variant: "outline", size: "lg" })} hover-lift`}>Contact the team</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
