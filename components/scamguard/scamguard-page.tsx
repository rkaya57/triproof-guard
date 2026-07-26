"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  ExternalLink,
  FileSearch,
  Fingerprint,
  Link2,
  Loader2,
  PlugZap,
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
type RiskLevel = "SAFE" | "CAUTION" | "HIGH_RISK" | "CRITICAL"

type ScanResult = {
  id: string
  type: ScanMode
  score: number
  riskLevel: RiskLevel
  summary: string
  signals: Array<{
    code: string
    severity: "info" | "low" | "medium" | "high" | "critical"
    title: string
    detail: string
  }>
  actions: string[]
  metadata: {
    rpcStatus: string
    rpcError?: string
    domain?: string
    walletAddress?: string
    ownerProgram?: string | null
    lamports?: number
    signatureCount?: number
    tokenMint?: {
      decimals?: number
      supply?: string
      mintAuthority: string | null
      freezeAuthority: string | null
      initialized?: boolean
    }
    simulation?: {
      attempted: boolean
      ok: boolean
      error?: string
      logs?: string[]
    }
  }
  scannedAt: string
}

type SolanaProvider = {
  isPhantom?: boolean
  isBackpack?: boolean
  publicKey?: { toString(): string }
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>
}

const examples: Record<ScanMode, string> = {
  url: "https://phantom-airdrop-claim.example/solana-bonus",
  wallet: "9xQeWvG816bUx9EPfFNtN5B2kWfdrain11111111111111111111",
  token: "FakeUSDCmintAuthorityStillEnabled111111111111111111",
  transaction:
    "Program request: approve delegate, set authority, close token account, transfer all SOL after airdrop claim",
}

const endpointByMode: Record<ScanMode, string> = {
  url: "/api/scamguard/scan-url",
  wallet: "/api/scamguard/scan-wallet",
  token: "/api/scamguard/scan-token",
  transaction: "/api/scamguard/scan-transaction",
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
    helper: "Paste a token mint address. RPC will inspect mint and freeze authority when configured.",
  },
  transaction: {
    label: "Transaction",
    icon: ClipboardCheck,
    helper: "Paste transaction instructions or a base64 serialized Solana transaction before signing.",
  },
} satisfies Record<ScanMode, { label: string; icon: typeof Link2; helper: string }>

function statusTone(status: RiskLevel) {
  if (status === "CRITICAL") return "border-red-400/40 bg-red-400/10 text-red-200"
  if (status === "HIGH_RISK") return "border-orange-400/40 bg-orange-400/10 text-orange-200"
  if (status === "CAUTION") return "border-amber-400/40 bg-amber-400/10 text-amber-200"
  return "border-green-400/40 bg-green-400/10 text-green-200"
}

function statusLabel(status: RiskLevel) {
  if (status === "HIGH_RISK") return "High Risk"
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ")
}

function severityTone(severity: string) {
  if (severity === "critical") return "border-red-400/30 bg-red-400/10 text-red-100"
  if (severity === "high") return "border-orange-400/30 bg-orange-400/10 text-orange-100"
  if (severity === "medium") return "border-amber-400/30 bg-amber-400/10 text-amber-100"
  if (severity === "low") return "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
  return "border-slate-400/30 bg-slate-400/10 text-slate-200"
}

function findSolanaProvider() {
  const browser = window as Window & {
    solana?: SolanaProvider
    backpack?: { solana?: SolanaProvider }
  }
  return browser.solana ?? browser.backpack?.solana ?? null
}

export function ScamGuardPage() {
  const [mode, setMode] = useState<ScanMode>("url")
  const [input, setInput] = useState(examples.url)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null)
  const [walletMessage, setWalletMessage] = useState<string | null>(null)

  const securityScore = useMemo(() => {
    if (!result) return 100
    return Math.max(0, 100 - result.score)
  }, [result])

  useEffect(() => {
    const provider = findSolanaProvider()
    void provider?.connect({ onlyIfTrusted: true }).then((connection) => {
      setConnectedWallet(connection.publicKey.toString())
    }).catch(() => undefined)
  }, [])

  async function runScan(nextMode = mode, nextInput = input) {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(endpointByMode[nextMode], {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: nextInput,
          walletAddress: connectedWallet,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? "ScamGuard scan failed")
      setResult(body as ScanResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : "ScamGuard scan failed")
    } finally {
      setLoading(false)
    }
  }

  function selectMode(nextMode: ScanMode) {
    setMode(nextMode)
    setInput(examples[nextMode])
    setResult(null)
    setError(null)
  }

  async function connectWallet() {
    const provider = findSolanaProvider()
    if (!provider) {
      setWalletMessage("No Solana wallet provider found. Install Phantom or Backpack to connect.")
      return
    }

    try {
      const connection = await provider.connect()
      setConnectedWallet(connection.publicKey.toString())
      setWalletMessage("Wallet connected. ScamGuard will include it as scan context.")
    } catch (err) {
      setWalletMessage(err instanceof Error ? err.message : "Wallet connection failed.")
    }
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
            <Link href="/docs/api" className={`${buttonVariants({ variant: "outline" })} hover-lift hidden sm:inline-flex`}>API</Link>
            <Link href="/dashboard/new-analysis" className={`${buttonVariants()} glow-primary hover-lift`}>Sybil Analysis</Link>
          </div>
        </header>

        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:pb-24 lg:pt-16">
          <div className="reveal-up flex flex-col gap-7">
            <div className="flex flex-wrap items-center gap-3">
              <span className="cyber-chip">Solana pre-sign security</span>
              <Badge variant="secondary" className="border-primary/30 text-primary">RPC + API + wallet context</Badge>
            </div>
            <h1 className="text-gradient animate-gradient-text max-w-4xl text-4xl font-semibold leading-tight text-balance sm:text-6xl">
              Stop wallet drains before users sign.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              ScamGuard Solana scans suspicious links, token mints, wallets, and transaction intent through a server-side risk engine. When Solana RPC is configured, it also checks token authorities, program ownership, balances, signatures, and serialized transaction simulation.
            </p>
            <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
              {[
                ["Pre-sign", "transaction intent"],
                ["Solana RPC", "mint + wallet checks"],
                ["B2B API", "SDK-ready module"],
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
                  <CardTitle className="text-2xl">Live pre-sign scanner</CardTitle>
                  <CardDescription>
                    Connect a wallet for context, paste a Solana item, then run the server-side ScamGuard engine.
                  </CardDescription>
                </div>
                <Badge variant="outline" className={cn("gap-2", result ? statusTone(result.riskLevel) : "border-primary/30 text-primary")}>
                  <span className="pulse-dot" /> {result ? statusLabel(result.riskLevel) : "Ready"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="rounded-xl border border-border bg-background/45 p-3 text-sm text-slate-300">
                  {connectedWallet ? (
                    <span className="break-all font-mono text-primary">{connectedWallet}</span>
                  ) : (
                    <span>No wallet connected. Scans still work without wallet context.</span>
                  )}
                </div>
                <Button type="button" variant="outline" className="text-white" onClick={connectWallet}>
                  <PlugZap data-icon="inline-start" /> Connect Wallet
                </Button>
              </div>
              {walletMessage && <p className="text-sm text-muted-foreground">{walletMessage}</p>}

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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button type="button" className="glow-primary" onClick={() => void runScan()} disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Radar data-icon="inline-start" />}
                  Run ScamGuard scan
                </Button>
                {error && <span className="text-sm text-red-200">{error}</span>}
              </div>

              <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
                <div className="premium-card rounded-2xl border border-border bg-background/55 p-5 text-center">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Security score</p>
                  <p className="text-gradient mt-2 text-5xl font-semibold">{securityScore}</p>
                  <p className="mt-2 text-sm text-muted-foreground">higher is safer</p>
                </div>
                <div className="premium-card rounded-2xl border border-border bg-background/55 p-5">
                  <p className="font-medium">{result?.summary ?? "Run a scan to see ScamGuard risk signals, recommended actions, and RPC metadata."}</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><FileSearch className="size-4" /> Signals</p>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {(result?.signals ?? []).map((signal) => (
                          <div key={signal.code} className={cn("rounded-lg border p-3", severityTone(signal.severity))}>
                            <p className="font-medium text-white">{signal.title}</p>
                            <p className="mt-1 leading-5">{signal.detail}</p>
                          </div>
                        ))}
                        {!result && <p>No scan yet.</p>}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><CheckCircle2 className="size-4" /> Actions</p>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        {(result?.actions ?? ["Paste an item and run the scanner before interacting."]).map((action) => <li key={action}>- {action}</li>)}
                      </ul>
                      {result && (
                        <div className="mt-4 rounded-lg border border-border bg-background/45 p-3 text-xs text-muted-foreground">
                          RPC: {result.metadata.rpcStatus}
                          {result.metadata.signatureCount !== undefined && <><br />Signatures sampled: {result.metadata.signatureCount}</>}
                          {result.metadata.ownerProgram && <><br />Owner: {result.metadata.ownerProgram}</>}
                          {result.metadata.rpcError && <><br />RPC note: {result.metadata.rpcError}</>}
                        </div>
                      )}
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
          <h2 className="text-gradient text-3xl font-semibold sm:text-5xl">Sybil analysis stays. ScamGuard becomes the real-time security layer.</h2>
          <p className="mt-4 text-muted-foreground">
            Tri-Proof keeps campaign wallet clustering and Sybil review, then adds a second product surface for scam prevention around suspicious dApps, token mints, and transactions.
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
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">B2B API</Badge>
            <h2 className="text-gradient text-3xl font-semibold sm:text-4xl">Embed ScamGuard inside wallets, launchpads, and Solana dApps.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Partners can call one authenticated endpoint for every scan type, or use the public scanner endpoints for lightweight UI flows.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              [Code2, "POST /api/v1/scamguard/scan", "Authenticated B2B endpoint using the existing TRIPROOF_API_KEY bearer flow."],
              [ClipboardCheck, "Pre-sign payloads", "Send instruction text or base64 serialized transactions for simulation-aware scoring."],
              [Fingerprint, "Mint authority checks", "When RPC is configured, mint and freeze authorities are inspected server-side."],
              [ExternalLink, "Public scan endpoints", "/api/scamguard/scan-url, scan-wallet, scan-token, and scan-transaction power the product UI."],
            ].map(([Icon, title, text]) => (
              <div key={title as string} className="premium-card hover-lift rounded-2xl border border-border bg-card/70 p-5">
                <Icon className="mb-4 text-primary" />
                <p className="font-semibold">{title as string}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text as string}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="glass-panel premium-card animated-border flex flex-col items-start justify-between gap-6 rounded-2xl p-8 md:flex-row md:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Unified product layer</p>
            <h2 className="text-gradient mt-3 text-2xl font-semibold sm:text-3xl">Wallet risk plus ScamGuard risk gives teams one security story.</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Use Sybil scoring for campaign eligibility, ScamGuard scoring for pre-sign safety, and the combined dashboard score for fast operational decisions.
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
