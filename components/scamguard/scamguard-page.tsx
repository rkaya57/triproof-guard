"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileSearch,
  Fingerprint,
  Link2,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Siren,
  WalletCards,
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
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type ScanMode = "url" | "wallet" | "token" | "transaction"

type ScanResult = {
  score: number
  status: "Safe" | "Caution" | "High Risk" | "Critical"
  summary: string
  reasons: string[]
  actions: string[]
}

const examples: Record<ScanMode, string> = {
  url: "https://phantom-airdrop-claim.example/solana-bonus",
  wallet: "9xQeWvG816bUx9EPfFNtN5B2kWfdrain11111111111111111111",
  token: "FakeUSDCmintAuthorityStillEnabled111111111111111111",
  transaction:
    "Program request: approve delegate, set authority, close token account, transfer all SOL after airdrop claim",
}

const modeConfig = {
  url: {
    label: "URL",
    icon: Link2,
    helper: "Paste a claim, mint, presale or airdrop link.",
  },
  wallet: {
    label: "Wallet",
    icon: WalletCards,
    helper: "Paste a Solana wallet or program address.",
  },
  token: {
    label: "Token Mint",
    icon: Fingerprint,
    helper: "Paste a token mint address or token page text.",
  },
  transaction: {
    label: "Transaction",
    icon: ClipboardCheck,
    helper: "Paste transaction instructions, signature, or serialized tx notes.",
  },
} satisfies Record<ScanMode, { label: string; icon: typeof Link2; helper: string }>

function analyzeInput(mode: ScanMode, input: string): ScanResult {
  const text = input.trim().toLowerCase()
  const reasons: string[] = []
  const actions: string[] = []
  let score = 12

  if (!text) {
    return {
      score: 0,
      status: "Safe",
      summary: "Paste an item to scan. ScamGuard will explain the likely risk before a user signs or visits.",
      reasons: ["No input scanned yet."],
      actions: ["Choose a scan type and paste a URL, wallet, token mint, or transaction details."],
    }
  }

  const add = (points: number, reason: string, action: string) => {
    score += points
    reasons.push(reason)
    actions.push(action)
  }

  if (mode === "url") {
    if (/airdrop|claim|bonus|free|presale|mint/.test(text)) {
      add(18, "The link uses high-risk campaign words such as claim, airdrop, mint, or presale.", "Verify the campaign from the official project account before opening.")
    }
    if (/phantom|solflare|jupiter|magiceden|tensor/.test(text) && !/\.com|\.app|\.io/.test(text)) {
      add(18, "The link appears to imitate a known Solana brand without a trusted domain pattern.", "Open the brand manually from bookmarks instead of this link.")
    }
    if (/seed|recovery phrase|private key|mnemonic/.test(text)) {
      add(48, "The page text asks for seed phrase or private key material.", "Never enter seed phrases. Treat this as a wallet-drain attempt.")
    }
    if (/bit\.ly|tinyurl|t\.co|redirect|short/.test(text)) {
      add(12, "Shortened or redirected links hide the final destination.", "Expand and inspect the final URL before interacting.")
    }
  }

  if (mode === "wallet") {
    if (/drain|scam|fake|111111/.test(text)) {
      add(42, "The address or label matches a suspicious wallet/program pattern in the demo threat rules.", "Do not approve transactions involving this account without deeper review.")
    }
    if (text.length < 32 || text.length > 60) {
      add(18, "The value does not look like a normal Solana address length.", "Confirm the address was copied correctly.")
    }
  }

  if (mode === "token") {
    if (/fake|usdc|airdrop|mint/.test(text)) {
      add(20, "The token input resembles a branded or airdrop token claim.", "Compare mint address with the official token registry or project docs.")
    }
    if (/authority|freeze|enabled|delegate/.test(text)) {
      add(28, "Mint/freeze/delegate authority risk is present in the input.", "Avoid thin-liquidity tokens with active dangerous authorities.")
    }
  }

  if (mode === "transaction") {
    if (/approve|delegate/.test(text)) {
      add(22, "The transaction may approve a delegate to move assets.", "Only approve delegates you fully trust and understand.")
    }
    if (/set authority|authority/.test(text)) {
      add(24, "The transaction may change account authority.", "Reject authority changes unless they are expected.")
    }
    if (/close.*account|close token/.test(text)) {
      add(20, "The transaction may close token accounts and reclaim balances.", "Review every account closure before signing.")
    }
    if (/transfer all|all sol|drain|sweep/.test(text)) {
      add(42, "The transaction may move all SOL or sweep assets.", "Do not sign. Use a burner wallet if testing is unavoidable.")
    }
  }

  if (!reasons.length) {
    reasons.push("No high-confidence rule matched in the demo engine.")
    actions.push("Still verify the source, wallet popup, and expected asset changes before signing.")
  }

  score = Math.min(100, score)
  const status =
    score >= 86 ? "Critical" : score >= 61 ? "High Risk" : score >= 31 ? "Caution" : "Safe"
  const summary =
    status === "Critical"
      ? "This looks like a likely wallet-drain or high-impact scam. Do not sign."
      : status === "High Risk"
        ? "Multiple risk signals are present. Treat this as unsafe until manually verified."
        : status === "Caution"
          ? "Some warning signs are present. Verify source and intent before interacting."
          : "No major demo rule fired, but this is not a guarantee of safety."

  return { score, status, summary, reasons, actions }
}

function statusTone(status: ScanResult["status"]) {
  if (status === "Critical") return "border-red-400/40 bg-red-400/10 text-red-200"
  if (status === "High Risk") return "border-orange-400/40 bg-orange-400/10 text-orange-200"
  if (status === "Caution") return "border-amber-400/40 bg-amber-400/10 text-amber-200"
  return "border-green-400/40 bg-green-400/10 text-green-200"
}

export function ScamGuardPage() {
  const [mode, setMode] = useState<ScanMode>("url")
  const [input, setInput] = useState(examples.url)
  const result = useMemo(() => analyzeInput(mode, input), [input, mode])

  function selectMode(nextMode: ScanMode) {
    setMode(nextMode)
    setInput(examples[nextMode])
  }

  return (
    <main className="premium-page min-h-screen overflow-hidden bg-background text-foreground">
      <section className="security-grid relative overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="glow-orb left-[-7rem] top-[-5rem] size-96" style={{ background: "var(--guard-cyan)" }} />
          <div className="glow-orb right-[-8rem] top-24 size-[28rem]" style={{ background: "var(--guard-purple)", animationDelay: "2s" }} />
        </div>

        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <span className="glow-primary flex size-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 transition-transform group-hover:scale-105">
              <ShieldCheck className="size-6 text-primary" />
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Tri-Proof Guard</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary/80">ScamGuard Solana</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/docs" className={`${buttonVariants({ variant: "outline" })} hover-lift hidden sm:inline-flex`}>Docs</Link>
            <Link href="/dashboard/new-analysis" className={`${buttonVariants()} glow-primary hover-lift`}>Sybil Analysis</Link>
          </div>
        </header>

        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:pb-24 lg:pt-16">
          <div className="reveal-up flex flex-col gap-7">
            <div className="flex flex-wrap items-center gap-3">
              <span className="cyber-chip">Solana pre-sign security</span>
              <Badge variant="secondary" className="border-primary/30 text-primary">URL + wallet + token + tx scanner</Badge>
            </div>
            <h1 className="text-gradient animate-gradient-text max-w-4xl text-4xl font-semibold leading-tight text-balance sm:text-6xl">
              Stop wallet drains before users sign.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              ScamGuard Solana adds a pre-sign security layer to Tri-Proof: scan suspicious links, token mints, wallets, and transaction intent before retail users or campaign teams interact with a risky dApp.
            </p>
            <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
              {[
                ["Pre-sign", "transaction intent"],
                ["Solana", "drainer patterns"],
                ["B2B", "API-ready module"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-xl border border-primary/20 bg-background/45 px-4 py-3 backdrop-blur">
                  <p className="text-gradient text-2xl font-semibold">{value}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <Card className="glass-panel premium-card animated-border data-scan reveal-up delay-200">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-2xl">Live demo scanner</CardTitle>
                  <CardDescription>
                    Demo rules today. Next step: Helius/Solana RPC simulation, token authority checks, and threat intelligence feeds.
                  </CardDescription>
                </div>
                <Badge variant="outline" className={cn("gap-2", statusTone(result.status))}>
                  <span className="pulse-dot" /> {result.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-2 sm:grid-cols-4">
                {(Object.keys(modeConfig) as ScanMode[]).map((item) => {
                  const Icon = modeConfig[item].icon
                  return (
                    <Button
                      key={item}
                      type="button"
                      variant={mode === item ? "secondary" : "outline"}
                      className={cn("hover-lift justify-start", mode === item && "border-primary/30 bg-primary/10 text-primary")}
                      onClick={() => selectMode(item)}
                    >
                      <Icon data-icon="inline-start" />
                      {modeConfig[item].label}
                    </Button>
                  )
                })}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{modeConfig[mode].helper}</span>
                  <button type="button" className="text-primary hover:underline" onClick={() => setInput(examples[mode])}>
                    Load example
                  </button>
                </div>
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  className="min-h-36 font-mono text-sm"
                  placeholder="Paste a suspicious Solana item..."
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
                <div className="premium-card rounded-2xl border border-border bg-background/55 p-5 text-center">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Risk score</p>
                  <p className="text-gradient mt-2 text-5xl font-semibold">{result.score}</p>
                  <p className="mt-2 text-sm text-muted-foreground">/ 100</p>
                </div>
                <div className="premium-card rounded-2xl border border-border bg-background/55 p-5">
                  <p className="font-medium">{result.summary}</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><Radar className="size-4" /> Signals</p>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        {result.reasons.map((reason) => <li key={reason}>- {reason}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><FileSearch className="size-4" /> Actions</p>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        {result.actions.map((action) => <li key={action}>- {action}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="mb-8 max-w-3xl">
          <Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">Integrated with Guard</Badge>
          <h2 className="text-gradient text-3xl font-semibold sm:text-5xl">Sybil analysis stays. ScamGuard Solana becomes the new security layer.</h2>
          <p className="mt-4 text-muted-foreground">
            Tri-Proof keeps campaign wallet clustering and Sybil review, then adds a second product surface for real-time scam prevention around suspicious dApps, tokens, and transactions.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            [ShieldAlert, "Retail protection", "Warn users before they interact with suspicious airdrops, mint links, or drain-style transactions."],
            [WalletCards, "Campaign security", "Review token mints, wallet addresses, and suspicious reward-claim links before sending users there."],
            [Siren, "Threat intelligence", "Turn community reports, known drainer domains, and transaction simulation into an API-ready security feed."],
          ].map(([Icon, title, text]) => (
            <Card key={title as string} className="glass-panel premium-card hover-lift">
              <CardHeader>
                <Icon className="text-primary" />
                <CardTitle>{title as string}</CardTitle>
                <CardDescription>{text as string}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-primary/[0.03]">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-16 sm:px-8 lg:grid-cols-4">
          {[
            [CheckCircle2, "URL reputation", "Domain, redirect, brand impersonation and seed-phrase lure checks."],
            [ClipboardCheck, "Transaction intent", "Approve delegate, set authority, close account and transfer-all detection."],
            [Fingerprint, "Token mint risk", "Mint/freeze authority, fake brand names and risky claim-token patterns."],
            [ExternalLink, "B2B API path", "SDK, REST API and dApp security badge for wallet and launchpad partners."],
          ].map(([Icon, title, text]) => (
            <div key={title as string} className="premium-card hover-lift rounded-2xl border border-border bg-card/70 p-5">
              <Icon className="mb-4 text-primary" />
              <p className="font-semibold">{title as string}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{text as string}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="glass-panel premium-card animated-border flex flex-col items-start justify-between gap-6 rounded-2xl p-8 md:flex-row md:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Next production step</p>
            <h2 className="text-gradient mt-3 text-2xl font-semibold sm:text-3xl">Connect live Solana RPC simulation and threat feeds.</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              The UI is integrated now. The next engineering layer is a server-side risk service using Solana RPC simulation, Helius enrichment, and a report database.
            </p>
          </div>
          <Link href="/dashboard/new-analysis" className={`${buttonVariants()} glow-primary hover-lift`}>
            Open Sybil Analysis <ArrowRight data-icon="inline-end" />
          </Link>
        </div>
      </section>
    </main>
  )
}
