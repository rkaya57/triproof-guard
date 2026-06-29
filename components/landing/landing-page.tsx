import Image from "next/image"
import Link from "next/link"
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  FileDown,
  Fingerprint,
  GitBranch,
  Network,
  ShieldAlert,
  Upload,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const problems = [
  "Bot/farm wallets drain reward pools",
  "Projects reward fake users",
  "Traditional checks are not enough",
]

const steps = [
  { icon: Upload, title: "Upload wallet CSV" },
  { icon: Activity, title: "Run probabilistic risk analysis" },
  { icon: Network, title: "Detect suspicious clusters" },
  { icon: FileDown, title: "Export clean winners" },
]

const features = [
  "Wallet Risk Score",
  "Funding Source Analysis",
  "Wallet Clustering",
  "Behavior Similarity",
  "Manual Review List",
  "Clean Reward List",
  "Known Entity Review",
  "Decision Explanations",
  "PDF/CSV Reports",
]

const roadmap = [
  ["Guard MVP", "Wallet CSV analysis, entity detection, cluster review, PDF/CSV reports"],
  ["Guard Pro", "Saved analyst decisions, API access, repeat campaign monitoring"],
  ["Tri-Proof Human", "Adaptive challenge layer and wallet-bound human signal"],
]

const previewRows = [
  ["0x0000...0001", "96", "Critical", "CL-001"],
  ["0x0000...0032", "82", "High", "CL-001"],
  ["0x0000...0144", "27", "Low", "-"],
  ["0x0000...0220", "54", "Medium", "CL-008"],
]

export function LandingPage() {
  return (
    <main className="premium-page min-h-screen overflow-hidden bg-background text-foreground">
      <section className="security-grid relative overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div
            className="glow-orb left-[-6rem] top-[-4rem] size-80"
            style={{ background: "var(--guard-cyan)" }}
          />
          <div
            className="glow-orb right-[-8rem] top-24 size-96"
            style={{ background: "var(--guard-purple)", animationDelay: "3s" }}
          />
          <div
            className="glow-orb bottom-[-8rem] left-1/3 size-80"
            style={{ background: "var(--guard-cyan)", opacity: 0.35, animationDelay: "6s" }}
          />
        </div>

        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <span className="glow-primary flex size-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 transition-transform group-hover:scale-105">
              <Image
                src="/logo.svg"
                alt="Tri-Proof Guard"
                width={30}
                height={30}
                priority
                className="rounded-lg"
              />
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Tri-Proof Guard</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary/80">
                Sybil Guard
              </span>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <Link href="#features" className="transition-colors hover:text-primary">
              Features
            </Link>
            <Link href="/pricing" className="transition-colors hover:text-primary">
              Pricing
            </Link>
            <Link href="/dashboard/demo" className="transition-colors hover:text-primary">
              Demo
            </Link>
          </nav>
          <Link href="/login" className={`${buttonVariants({ variant: "outline" })} hover-lift`}>
            Login
          </Link>
        </header>

        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-24 lg:pt-20">
          <div className="reveal-up flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              <span className="cyber-chip w-fit">
                Web3 Sybil Defense • Live MVP
              </span>
              <h1 className="text-gradient animate-gradient-text max-w-4xl text-4xl font-semibold leading-tight text-balance sm:text-6xl">
                Protect your Web3 campaign from Sybil farms.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Tri-Proof Guard analyzes wallet lists, detects suspicious clusters,
                scores wallet risk and exports cleaner reward lists before airdrops,
                testnets and whitelist campaigns.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard/new-analysis"
                className={`${buttonVariants({ size: "lg" })} glow-primary hover-lift`}
              >
                Start Analysis <ArrowRight data-icon="inline-end" />
              </Link>
              <Link
                href="/dashboard/demo"
                className={`${buttonVariants({ variant: "outline", size: "lg" })} hover-lift`}
              >
                View Demo Report
              </Link>
            </div>
            <div className="flex flex-wrap gap-3 font-mono text-xs uppercase text-primary">
              <span className="flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1">
                <span className="pulse-dot" /> Upload wallets
              </span>
              <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1">
                Detect Sybil clusters
              </span>
              <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1">
                Export clean winners
              </span>
            </div>
          </div>

          <div className="glass-panel premium-card animated-border data-scan relative min-h-[430px] overflow-hidden rounded-2xl p-5 reveal-up delay-200">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Campaign Risk Console</p>
                <p className="text-xs text-muted-foreground">Ethereum Airdrop Wallet Audit</p>
              </div>
              <Badge variant="secondary" className="gap-2 border-primary/30 text-primary">
                <span className="pulse-dot" /> Live preview
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["500", "Wallets", "Total uploaded"],
                ["8", "Clusters", "Manual review"],
                ["42.8", "Avg risk", "Campaign score"],
              ].map(([value, label, detail], index) => (
                <div
                  key={label}
                  className="premium-card hover-lift rounded-xl border border-border bg-background/60 p-4"
                  style={{ animationDelay: `${index * 0.08}s` }}
                >
                  <p className="text-gradient text-2xl font-semibold">{value}</p>
                  <p className="text-sm text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{detail}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-xl border border-border bg-background/50 p-4">
                <div className="mb-4 flex items-center justify-between text-sm">
                  <span>Risk distribution</span>
                  <span className="text-muted-foreground">500 rows</span>
                </div>
                <div className="flex h-44 items-end gap-3">
                  {[
                    ["Low", "112px", "var(--guard-green)", "0s"],
                    ["Medium", "74px", "var(--guard-yellow)", "0.3s"],
                    ["High", "48px", "var(--guard-orange)", "0.6s"],
                    ["Critical", "32px", "var(--guard-red)", "0.9s"],
                  ].map(([label, height, color, delay]) => (
                    <div key={label} className="flex flex-1 flex-col items-center gap-2">
                      <div
                        className="bar-pulse w-full rounded-t-md"
                        style={{
                          height,
                          backgroundColor: color,
                          boxShadow: `0 0 18px ${color}`,
                          animationDelay: delay,
                        }}
                      />
                      <span className="text-[11px] text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-border bg-background/50">
                {previewRows.map(([wallet, score, risk, cluster], index) => (
                  <div
                    key={wallet}
                    className="grid grid-cols-[1fr_72px_90px_70px] border-b border-border px-4 py-3 text-xs transition-colors last:border-b-0 hover:bg-primary/5"
                    style={{ animationDelay: `${index * 0.08}s` }}
                  >
                    <span className="font-mono text-muted-foreground">{wallet}</span>
                    <span>{score}</span>
                    <span>{risk}</span>
                    <span className="text-primary">{cluster}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 border-t border-border/70 bg-background/40 backdrop-blur">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px overflow-hidden md:grid-cols-4">
            {[
              ["100K+", "Wallets queue-ready"],
              ["6", "EVM chains supported"],
              ["Batch", "Large CSV processing"],
              ["No token", "USDC revenue model"],
            ].map(([value, label]) => (
              <div
                key={label}
                className="hover-lift flex flex-col items-center gap-1 px-5 py-8 text-center transition-colors hover:bg-primary/5"
              >
                <span className="text-gradient text-3xl font-semibold sm:text-4xl">
                  {value}
                </span>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-16 sm:px-8 lg:grid-cols-3">
        {problems.map((problem, index) => (
          <Card key={problem} className="glass-panel premium-card hover-lift reveal-up" style={{ animationDelay: `${index * 0.1}s` }}>
            <CardHeader>
              <ShieldAlert className="text-destructive" />
              <CardTitle>{problem}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="mb-10 flex flex-col gap-3">
            <h2 className="text-gradient text-3xl font-semibold">A clean workflow for reward decisions.</h2>
            <p className="max-w-2xl text-muted-foreground">
              The MVP focuses on wallet list analysis only: no biometrics, no token gate,
              no Proof of Humanity implementation.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {steps.map((step, index) => (
              <Card
                key={step.title}
                className="glass-panel premium-card hover-lift group relative overflow-hidden"
              >
                <span className="pointer-events-none absolute right-3 top-2 font-mono text-4xl font-bold text-primary/10 transition-colors group-hover:text-primary/20">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <CardHeader>
                  <span className="glow-primary mb-2 flex size-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary transition-transform group-hover:scale-110">
                    <step.icon />
                  </span>
                  <CardTitle className="text-base">{step.title}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <h2 className="text-gradient text-3xl font-semibold">Decision support, not identity claims.</h2>
            <p className="mt-4 text-muted-foreground">
              Tri-Proof Guard surfaces suspicious patterns and clean list suggestions so
              project teams can make final reward decisions with better evidence.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {features.map((feature) => (
              <div
                key={feature}
                className="premium-card hover-lift flex items-center gap-3 rounded-lg border border-border bg-card/70 px-4 py-3 transition-colors hover:border-primary/45 hover:bg-primary/5"
              >
                <CheckCircle2 className="text-primary" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            ["Starter", "49-99 USDC", "Up to 5,000 wallets"],
            ["Growth", "199-499 USDC", "Cluster analysis and PDF report"],
            ["Pro", "1,000+ USDC", "100,000+ wallets and API beta"],
          ].map(([name, price, detail]) => (
            <Card key={name} className="glass-panel premium-card hover-lift">
              <CardHeader>
                <CardTitle>{name}</CardTitle>
                <CardDescription>{detail}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-gradient text-xl font-semibold">{price}</span>
                <Link href="/pricing" className={`${buttonVariants({ variant: "outline" })} hover-lift`}>
                  View
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="mb-8 flex flex-col gap-3">
            <Badge variant="secondary" className="w-fit gap-2 border-primary/30 text-primary">
              <GitBranch className="size-3.5" />
              Roadmap
            </Badge>
            <h2 className="text-gradient text-3xl font-semibold">Built in layers for campaign security teams.</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {roadmap.map(([phase, detail], index) => (
              <div key={phase} className="glass-panel premium-card hover-lift rounded-lg p-5">
                <span className="cyber-chip mb-3">Phase {index + 1}</span>
                <p className="mt-1 font-semibold">{phase}</p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="glass-panel scan-accent premium-card animated-border relative flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl p-8 sm:p-10 md:flex-row md:items-center">
          <div className="relative z-10">
            <h2 className="text-gradient text-2xl font-semibold sm:text-3xl">
              Analyze your wallet list in minutes
            </h2>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Start with CSV upload, export approved wallets, and route edge cases to manual review.
            </p>
          </div>
          <div className="relative z-10 flex gap-3">
            <Link href="/register" className={`${buttonVariants()} glow-primary hover-lift`}>
              Create Account
            </Link>
            <Link href="/dashboard/demo" className={`${buttonVariants({ variant: "outline" })} hover-lift`}>
              Demo Report
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/20">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-sm text-muted-foreground sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Fingerprint />
            <span>
              Tri-Proof Human - adaptive human challenge and wallet-bound human signal. Coming after Guard MVP.
            </span>
          </div>
          <Button variant="ghost" disabled>
            Coming later
          </Button>
        </div>
      </section>
    </main>
  )
}
