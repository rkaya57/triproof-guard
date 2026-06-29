import Image from "next/image"
import Link from "next/link"
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  FileDown,
  GitBranch,
  Layers3,
  LockKeyhole,
  Mail,
  Network,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
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

const navLinks = [
  ["Workflow", "#workflow"],
  ["Features", "#features"],
  ["Docs", "/docs"],
  ["Blog", "/blog"],
  ["Pricing", "/pricing"],
  ["Contact", "/contact"],
  ["Demo", "/dashboard/demo"],
]

const heroStats = [
  ["100", "free wallet trial"],
  ["6", "EVM chains ready"],
  ["USDC", "simple revenue model"],
]

const consoleStats = [
  ["500", "Wallets", "Uploaded list"],
  ["8", "Clusters", "Suspicious groups"],
  ["42.8", "Avg risk", "Risk snapshot"],
]

const riskRows = [
  ["0x71b...a91", "96", "Critical", "Reject"],
  ["0x38f...42c", "82", "High", "Review"],
  ["0x9dd...117", "54", "Medium", "Review"],
  ["0x4aa...8e2", "27", "Low", "Approve"],
]

const painPoints = [
  {
    icon: ShieldAlert,
    title: "Reward pools leak to Sybil farms",
    text: "A long wallet list does not mean real community growth. Farmers can inflate campaigns before distribution.",
  },
  {
    icon: Network,
    title: "Clusters are hard to review manually",
    text: "Shared funding sources, repeated behavior and low-activity wallets are difficult to detect in spreadsheets.",
  },
  {
    icon: FileCheck2,
    title: "Teams need defensible reward decisions",
    text: "Projects need clean lists, manual review queues and clear explanations before they send rewards.",
  },
]

const workflow = [
  { icon: Upload, title: "Upload wallet CSV", text: "Import campaign participants from airdrops, quests, testnets or allowlists." },
  { icon: Activity, title: "Enrich on-chain data", text: "Run real on-chain or hybrid analysis with provider evidence from supported EVM chains." },
  { icon: Radar, title: "Detect clusters", text: "Surface suspicious groups, shared funding patterns and similar behavior." },
  { icon: FileDown, title: "Export decision lists", text: "Download approved, manual review and rejected wallet outputs for the team." },
]

const features = [
  "Real on-chain enrichment",
  "Wallet risk score",
  "Funding source analysis",
  "Suspicious cluster detection",
  "Behavior similarity signals",
  "Approved / review / rejected lists",
  "CSV and PDF reporting",
  "Known entity review",
  "Batch queue for large lists",
  "USDC checkout flow",
]

const useCases = [
  ["Airdrops", "Clean reward lists before token or USDC distribution."],
  ["Testnets", "Filter farmers before points or whitelist allocation."],
  ["Galxe / Zealy quests", "Review wallet lists before community reward campaigns."],
]

const plans = [
  ["Free Trial", "100 wallets", "Try the core report before payment", "/dashboard/new-analysis"],
  ["Starter", "99 USDC", "Up to 1,000 wallet credits", "/checkout?plan=starter"],
  ["Growth", "249 USDC", "Up to 10,000 wallet credits", "/checkout?plan=growth"],
]

export function LandingPage() {
  return (
    <main className="premium-page min-h-screen overflow-hidden bg-background text-foreground">
      <section className="security-grid relative overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="glow-orb left-[-7rem] top-[-5rem] size-96" style={{ background: "var(--guard-cyan)" }} />
          <div className="glow-orb right-[-9rem] top-20 size-[28rem]" style={{ background: "var(--guard-purple)", animationDelay: "2s" }} />
          <div className="glow-orb bottom-[-10rem] left-1/3 size-96" style={{ background: "var(--guard-cyan)", opacity: 0.32, animationDelay: "5s" }} />
        </div>

        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
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
            <Link href="/dashboard/new-analysis" className={`${buttonVariants()} glow-primary hover-lift`}>Start Free</Link>
          </div>
        </header>

        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:pb-24 lg:pt-20">
          <div className="reveal-up flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="cyber-chip">Web3 Anti-Sybil MVP</span>
                <Badge variant="secondary" className="border-primary/30 text-primary">100 wallets free</Badge>
              </div>
              <h1 className="text-gradient animate-gradient-text max-w-4xl text-4xl font-semibold leading-tight text-balance sm:text-6xl lg:text-7xl">
                Stop Sybil farms before reward distribution.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Tri-Proof Guard helps Web3 teams analyze campaign wallet lists, enrich addresses with real on-chain evidence, flag suspicious clusters and export cleaner reward decisions before airdrops, testnets and community payouts.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/dashboard/new-analysis" className={`${buttonVariants({ size: "lg" })} glow-primary hover-lift`}>Start 100-wallet trial <ArrowRight data-icon="inline-end" /></Link>
              <Link href="/docs" className={`${buttonVariants({ variant: "outline", size: "lg" })} hover-lift`}>Read docs <BookOpen data-icon="inline-end" /></Link>
            </div>

            <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
              {heroStats.map(([value, label], index) => (
                <div key={label} className="rounded-xl border border-primary/20 bg-background/45 px-4 py-3 backdrop-blur reveal-up" style={{ animationDelay: `${index * 0.08}s` }}>
                  <p className="text-gradient text-2xl font-semibold">{value}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel premium-card animated-border data-scan relative min-h-[460px] overflow-hidden rounded-3xl p-5 reveal-up delay-200">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Campaign Risk Console</p>
                <p className="text-xs text-muted-foreground">Base Airdrop Wallet Audit</p>
              </div>
              <Badge variant="secondary" className="gap-2 border-primary/30 text-primary"><span className="pulse-dot" /> Live workflow</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {consoleStats.map(([value, label, detail], index) => (
                <div key={label} className="premium-card hover-lift rounded-xl border border-border bg-background/60 p-4" style={{ animationDelay: `${index * 0.08}s` }}>
                  <p className="text-gradient text-2xl font-semibold">{value}</p>
                  <p className="text-sm text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
              <div className="rounded-xl border border-border bg-background/50 p-4">
                <div className="mb-4 flex items-center justify-between text-sm">
                  <span>Risk distribution</span>
                  <span className="text-muted-foreground">On-chain evidence</span>
                </div>
                <div className="flex h-48 items-end gap-3">
                  {[
                    ["Low", "128px", "var(--guard-green)", "0s"],
                    ["Medium", "88px", "var(--guard-yellow)", "0.3s"],
                    ["High", "64px", "var(--guard-orange)", "0.6s"],
                    ["Critical", "42px", "var(--guard-red)", "0.9s"],
                  ].map(([label, height, color, delay]) => (
                    <div key={label} className="flex flex-1 flex-col items-center gap-2">
                      <div className="bar-pulse w-full rounded-t-md" style={{ height, backgroundColor: color, boxShadow: `0 0 18px ${color}`, animationDelay: delay }} />
                      <span className="text-[11px] text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-border bg-background/50">
                <div className="grid grid-cols-[1fr_72px_86px_80px] border-b border-border bg-primary/5 px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <span>Wallet</span><span>Score</span><span>Risk</span><span>Action</span>
                </div>
                {riskRows.map(([wallet, score, risk, action], index) => (
                  <div key={wallet} className="grid grid-cols-[1fr_72px_86px_80px] border-b border-border px-4 py-3 text-xs transition-colors last:border-b-0 hover:bg-primary/5" style={{ animationDelay: `${index * 0.08}s` }}>
                    <span className="font-mono text-muted-foreground">{wallet}</span><span>{score}</span><span>{risk}</span><span className="text-primary">{action}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[[LockKeyhole, "No token required"], [CircleDollarSign, "USDC checkout"], [Layers3, "Batch queue ready"]].map(([Icon, label]) => (
                <div key={label as string} className="flex items-center gap-2 rounded-xl border border-border bg-background/45 px-3 py-2 text-xs text-muted-foreground">
                  <Icon className="size-4 text-primary" /><span>{label as string}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-16 sm:px-8 lg:grid-cols-3">
        {painPoints.map((item, index) => (
          <Card key={item.title} className="glass-panel premium-card hover-lift reveal-up" style={{ animationDelay: `${index * 0.1}s` }}>
            <CardHeader><item.icon className="text-destructive" /><CardTitle>{item.title}</CardTitle><CardDescription>{item.text}</CardDescription></CardHeader>
          </Card>
        ))}
      </section>

      <section id="workflow" className="border-y border-border bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">Operator workflow</Badge>
              <h2 className="text-gradient text-3xl font-semibold sm:text-4xl">From raw wallet CSV to cleaner reward list.</h2>
            </div>
            <p className="max-w-xl text-muted-foreground">The product is decision support, not identity certification. Your team keeps the final decision.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
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
            <p className="mt-4 leading-7 text-muted-foreground">Tri-Proof Guard focuses on one job: help Web3 projects review wallet lists before rewards go out. It returns signals, clusters and suggested actions without making impossible “100% bot detection” claims.</p>
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
          <div className="grid gap-5 md:grid-cols-3">
            {useCases.map(([title, text]) => (<Card key={title} className="glass-panel premium-card hover-lift"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{text}</CardDescription></CardHeader></Card>))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div><Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">Simple pricing</Badge><h2 className="text-gradient text-3xl font-semibold sm:text-4xl">Start free. Upgrade with USDC when the list gets bigger.</h2></div>
          <Link href="/pricing" className={`${buttonVariants({ variant: "outline" })} hover-lift w-fit`}>Full pricing <ArrowRight data-icon="inline-end" /></Link>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {plans.map(([name, price, detail, href]) => (<Card key={name} className="glass-panel premium-card hover-lift"><CardHeader><CardTitle>{name}</CardTitle><CardDescription>{detail}</CardDescription></CardHeader><CardContent className="flex items-center justify-between gap-4"><span className="text-gradient text-xl font-semibold">{price}</span><Link href={href} className={`${buttonVariants({ variant: name === "Free Trial" ? "default" : "outline" })} hover-lift`}>Open</Link></CardContent></Card>))}
        </div>
      </section>

      <section className="border-y border-border bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="mb-8 flex flex-col gap-3"><Badge variant="secondary" className="w-fit gap-2 border-primary/30 text-primary"><GitBranch className="size-3.5" />Roadmap</Badge><h2 className="text-gradient text-3xl font-semibold sm:text-4xl">Built in layers, without forcing a native token.</h2></div>
          <div className="grid gap-4 md:grid-cols-3">
            {[["Guard MVP", "On-chain wallet enrichment, risk score, cluster review and PDF/CSV exports."], ["Guard Pro", "Saved decisions, team review workflow, API access and repeat campaign monitoring."], ["Tri-Proof Human", "Future adaptive challenge layer and wallet-bound human signal."]].map(([phase, detail], index) => (<div key={phase} className="glass-panel premium-card hover-lift rounded-lg p-5"><span className="cyber-chip mb-3">Phase {index + 1}</span><p className="mt-1 font-semibold">{phase}</p><p className="mt-3 text-sm leading-6 text-muted-foreground">{detail}</p></div>))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="glass-panel scan-accent premium-card animated-border relative flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl p-8 sm:p-10 md:flex-row md:items-center">
          <div className="relative z-10"><div className="mb-3 flex items-center gap-2 text-primary"><Sparkles className="size-5" /><span className="font-mono text-xs uppercase tracking-[0.2em]">Live MVP</span></div><h2 className="text-gradient text-2xl font-semibold sm:text-3xl">Test the first 100 wallets free today.</h2><p className="mt-2 max-w-xl text-muted-foreground">Upload a CSV, review risk signals and see whether Tri-Proof Guard fits your Web3 campaign workflow.</p></div>
          <div className="relative z-10 flex flex-col gap-3 sm:flex-row"><Link href="/dashboard/new-analysis" className={`${buttonVariants()} glow-primary hover-lift`}>Start free analysis</Link><Link href="/docs" className={`${buttonVariants({ variant: "outline" })} hover-lift`}>Read docs</Link><Link href="/contact" className={`${buttonVariants({ variant: "outline" })} hover-lift`}>Contact</Link></div>
        </div>
      </section>

      <footer className="border-t border-border bg-muted/20">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-sm text-muted-foreground sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2"><ShieldCheck className="text-primary" /><span>Tri-Proof Guard — Web3 wallet risk analysis for campaign teams.</span></div>
          <div className="flex flex-wrap gap-4"><Link href="/docs" className="hover:text-primary">Docs</Link><Link href="/blog" className="hover:text-primary">Blog</Link><Link href="/contact" className="hover:text-primary">Contact</Link><Link href="/pricing" className="hover:text-primary">Pricing</Link><Link href="/dashboard/demo" className="hover:text-primary">Demo</Link><Link href="/login" className="hover:text-primary">Login</Link></div>
        </div>
      </footer>
    </main>
  )
}
