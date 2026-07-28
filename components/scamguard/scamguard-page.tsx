"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Download,
  ExternalLink,
  FileSearch,
  Fingerprint,
  Gauge,
  Link2,
  Loader2,
  LockKeyhole,
  Network,
  PackageCheck,
  PlugZap,
  Puzzle,
  Radar,
  SearchCheck,
  Send,
  Settings2,
  ShieldAlert,
  ShieldCheck,
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
import { scamGuardTelegramBotUrl } from "@/lib/telegram/links"

type ScanMode = "url" | "wallet" | "token" | "transaction"
type ScanChain = "solana" | "evm"
type RiskLevel = "SAFE" | "CAUTION" | "HIGH_RISK" | "CRITICAL"

type ScanResult = {
  id: string
  type: ScanMode
  score: number
  riskLevel: RiskLevel
  summary: string
  confidence: "LOW" | "MEDIUM" | "HIGH"
  explanation: string
  signals: Array<{
    code: string
    severity: "info" | "low" | "medium" | "high" | "critical"
    title: string
    detail: string
  }>
  actions: string[]
  metadata: {
    chain: "solana" | "evm" | "unknown"
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
    decodedIntent?: {
      method?: string
      category?: string
      assetChange?: string
      spender?: string
      recipient?: string
      amount?: string
      instructionCount?: number
      programs?: string[]
      warnings: string[]
    }
    reputation?: {
      verdict: "trusted" | "unknown" | "suspicious" | "known_bad"
      source: string
      notes: string[]
    }
    domainIntelligence?: {
      host?: string
      root?: string
      tld?: string
      sourceUrl?: string
      features: string[]
    }
    sandbox?: {
      status: "complete" | "blocked" | "failed" | "unsupported" | "disabled"
      sourceUrl: string
      finalUrl?: string
      httpStatus?: number
      contentType?: string
      contentBytes?: number
      elapsedMs: number
      redirectChain: string[]
      resolvedAddressCount: number
      blockReason?: string
      error?: string
      behaviorFlags: string[]
      stats?: {
        tagCount: number
        scriptCount: number
        formCount: number
        iframeCount: number
        externalScriptCount: number
      }
    }
    scamDna?: {
      fingerprintKey: string
      clusterKey: string
      behaviorFlags: string[]
      walletTargetCount: number
      programTargetCount: number
      stats: {
        tagCount: number
        scriptCount: number
        formCount: number
        iframeCount: number
        externalScriptCount: number
      }
      match: {
        matched: boolean
        actionable: boolean
        similarity: number
        confidence: "LOW" | "MEDIUM" | "HIGH"
        verdict: "unknown" | "suspicious" | "known_bad"
        campaignId?: string
        campaignLabel?: string
        matchedDomain?: string
        crossDomain: boolean
        evidence: string[]
      }
      persisted: boolean
    }
    contractIntelligence?: {
      target?: string
      checked: boolean
      isContract?: boolean
      verified?: boolean
      proxy?: boolean
      source: "rpc" | "etherscan" | "skipped"
      notes: string[]
    }
    decision?: {
      primaryReason: string
      trustContext: string
      riskDrivers: string[]
      userMessage: string
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

const evmExamples: Record<ScanMode, string> = {
  url: "https://metamask-airdrop-claim.xyz/bonus",
  wallet: "0x0000000000000000000000000000000000000000",
  token: "0x0000000000000000000000000000000000000000",
  transaction:
    "{\"method\":\"eth_sendTransaction\",\"params\":[{\"to\":\"0x1111111111111111111111111111111111111111\",\"data\":\"0x095ea7b3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff\"}]}",
}

const scanPresets = [
  {
    label: "Safe verified dApp",
    chain: "solana",
    mode: "url",
    value: "https://app.nestusd.com/season",
    detail: "Trusted-style project domain with campaign language.",
  },
  {
    label: "Suspicious airdrop",
    chain: "evm",
    mode: "url",
    value: "https://metamask-airdrop-claim.xyz/bonus",
    detail: "Claim wording plus risky disposable domain pattern.",
  },
  {
    label: "Unlimited approval",
    chain: "evm",
    mode: "transaction",
    value:
      "{\"method\":\"eth_sendTransaction\",\"params\":[{\"to\":\"0x1111111111111111111111111111111111111111\",\"data\":\"0x095ea7b3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff\"}]}",
    detail: "EVM approval payload with very high allowance.",
  },
  {
    label: "Unknown token mint",
    chain: "solana",
    mode: "token",
    value: "FakeUSDCmintAuthorityStillEnabled111111111111111111",
    detail: "Token scan with mint and authority heuristics.",
  },
] satisfies Array<{ label: string; chain: ScanChain; mode: ScanMode; value: string; detail: string }>

const intelligenceNetwork = [
  ["Known bad domains", "Blocks or escalates domains seen in phishing and drainer campaigns."],
  ["Suspicious spenders", "Flags unknown or dangerous approval targets before a user signs."],
  ["Verified project domains", "Reduces false positives for real projects without hiding transaction risk."],
  ["Contract/deployer history", "Checks EVM bytecode, verification, proxy status, and deployer reputation."],
  ["Community feedback", "Accepts false-positive, false-negative, safe, and scam reports for review."],
] as const

const methodologySteps = [
  [SearchCheck, "Classify the surface", "URL, wallet, token, contract, or transaction payload is routed to the right scanner."],
  [Network, "Enrich context", "Domain, chain, RPC, contract, reputation, and source URL context are collected where available."],
  [Gauge, "Score the risk", "Signals are weighted into SAFE, CAUTION, HIGH_RISK, or CRITICAL with confidence attached."],
  [LockKeyhole, "Explain the action", "The result returns user-facing reasons and next steps instead of a black-box verdict."],
] as const

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
    helper: "Paste a Solana wallet/program address or an EVM 0x wallet.",
  },
  token: {
    label: "Token Mint",
    icon: Fingerprint,
    helper: "Paste a Solana token mint or EVM token contract.",
  },
  transaction: {
    label: "Transaction",
    icon: ClipboardCheck,
    helper: "Paste Solana instructions, base64 transaction, or EVM wallet request JSON before signing.",
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

function shortValue(value?: string | null) {
  if (!value) return "Not available"
  return value.length > 34 ? `${value.slice(0, 14)}...${value.slice(-10)}` : value
}

function verdictLabel(verdict?: string) {
  if (!verdict) return "Unknown"
  return verdict
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
}

function intentLabel(result: ScanResult | null) {
  const intent = result?.metadata.decodedIntent
  if (!intent) return result ? "No transaction intent decoded" : "Waiting for scan"
  const category = intent.category ? intent.category.replaceAll("_", " ") : "unknown intent"
  return intent.method ? `${category} / ${intent.method}` : category
}

function contractLabel(result: ScanResult | null) {
  const contract = result?.metadata.contractIntelligence
  if (!result) return "Waiting for scan"
  if (!contract) return result.metadata.chain === "evm" ? "No contract target" : "Not required for this scan"
  if (!contract.checked) return "Skipped"
  if (!contract.isContract) return "EOA target"
  if (contract.proxy) return contract.verified ? "Verified proxy" : "Unverified proxy"
  return contract.verified ? "Verified contract" : "Unverified contract"
}

function dataSourceLabel(result: ScanResult | null) {
  if (!result) return "No scan run"
  const items = [
    result.metadata.reputation?.source,
    result.metadata.rpcStatus !== "not_applicable" ? `RPC ${result.metadata.rpcStatus}` : null,
    result.metadata.contractIntelligence?.source,
    result.metadata.domainIntelligence?.features?.length ? "domain intelligence" : null,
    result.metadata.sandbox ? `sandbox ${result.metadata.sandbox.status}` : null,
    result.metadata.scamDna ? "Scam DNA" : null,
  ].filter(Boolean)
  return items.length ? items.join(" + ") : "local rule engine"
}

function sandboxLabel(result: ScanResult | null) {
  const sandbox = result?.metadata.sandbox
  if (!sandbox) return result ? (result.type === "url" ? "Not run" : "Not required") : "Waiting"
  if (sandbox.status === "complete") return `${sandbox.httpStatus ?? "HTTP"} · ${sandbox.elapsedMs} ms`
  if (sandbox.status === "blocked") return "Network policy blocked"
  if (sandbox.status === "unsupported") return "Non-HTML response"
  if (sandbox.status === "failed") return "Fetch unavailable"
  return "Disabled"
}

function dnaLabel(result: ScanResult | null) {
  const dna = result?.metadata.scamDna
  if (!dna) return result ? (result.type === "url" ? "No fingerprint" : "Not required") : "Waiting"
  if (!dna.match.matched) return "New fingerprint"
  if (!dna.match.crossDomain) return "Site baseline"
  return `${Math.round(dna.match.similarity * 100)}% · ${verdictLabel(dna.match.verdict)}`
}

function primaryReason(result: ScanResult | null) {
  return result?.metadata.decision?.primaryReason ?? result?.signals[0]?.detail ?? "Run a scan to see the strongest reason behind the decision."
}

function decisionTone(result: ScanResult | null) {
  if (!result) return "Ready"
  if (result.riskLevel === "CRITICAL") return "Stop"
  if (result.riskLevel === "HIGH_RISK") return "Review required"
  if (result.riskLevel === "CAUTION") return "Verify source"
  return "Clean first pass"
}

function saferSteps(result: ScanResult | null) {
  if (!result) {
    return [
      "Run a scan before opening reward, mint, or claim links.",
      "Connect a wallet only when wallet context helps the review.",
      "Compare the final wallet popup with the action you expected.",
    ]
  }

  const steps = [
    ...result.actions,
    "Confirm the URL from the project's official website, X account, Discord, or docs.",
    "Compare token mints, spender addresses, and program IDs with official documentation.",
    "Use a burner wallet for unavoidable testing until the source is verified.",
  ]

  if (result.metadata.reputation?.verdict === "trusted") {
    steps.unshift("Trusted source context reduces false positives, but still review the wallet action.")
  }
  if (result.metadata.decodedIntent?.spender) {
    steps.unshift(`Verify spender ${shortValue(result.metadata.decodedIntent.spender)} before approving any allowance.`)
  }
  if (result.metadata.contractIntelligence?.verified === false) {
    steps.unshift("Prefer contracts with verified source and published official addresses.")
  }
  if (result.metadata.rpcStatus === "skipped" || result.metadata.rpcStatus === "failed") {
    steps.push("Enable the relevant RPC/API provider to improve on-chain confidence.")
  }

  return Array.from(new Set(steps)).slice(0, 4)
}

function resultMetricRows(result: ScanResult | null) {
  return [
    ["Decision", decisionTone(result)],
    ["Confidence", result?.confidence ?? "Waiting"],
    ["Reputation", verdictLabel(result?.metadata.reputation?.verdict)],
    ["URL Sandbox", sandboxLabel(result)],
    ["Scam DNA", dnaLabel(result)],
    ["Intent", intentLabel(result)],
    ["Contract", contractLabel(result)],
    ["Sources", dataSourceLabel(result)],
  ]
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
  const [chain, setChain] = useState<ScanChain>("solana")
  const [input, setInput] = useState(examples.url)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
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
          chain,
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
    setInput((chain === "evm" ? evmExamples : examples)[nextMode])
    setResult(null)
    setError(null)
  }

  function selectChain(nextChain: ScanChain) {
    setChain(nextChain)
    setInput((nextChain === "evm" ? evmExamples : examples)[mode])
    setResult(null)
    setError(null)
    setFeedbackMessage(null)
  }

  function loadPreset(preset: (typeof scanPresets)[number]) {
    setChain(preset.chain)
    setMode(preset.mode)
    setInput(preset.value)
    setResult(null)
    setError(null)
    setFeedbackMessage(null)
  }

  async function submitFeedback(verdict: "reported_scam" | "reported_safe" | "false_positive" | "false_negative") {
    if (!result) return
    setFeedbackMessage("Sending feedback...")
    const response = await fetch("/api/scamguard/feedback", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scanId: result.id,
        verdict,
        value: input,
        chain,
        source: "scamguard_page",
      }),
    })
    setFeedbackMessage(response.ok ? "Feedback saved. ScamGuard will learn from this review." : "Could not save feedback.")
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
        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 transition-transform group-hover:scale-105">
              <ShieldCheck className="size-6 text-primary" />
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight">Tri-Proof Guard</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary/80">ScamGuard</span>
            </div>
          </Link>
          <div className="hidden items-center gap-3 lg:flex">
            <a href="#scan" className="hidden text-sm text-slate-300 transition hover:text-white md:inline-flex">Scanner</a>
            <a href="#extension" className="hidden text-sm text-slate-300 transition hover:text-white lg:inline-flex">Extension</a>
            <Link href="/docs/api" className={`${buttonVariants({ variant: "outline" })} hover-lift hidden sm:inline-flex`}>API</Link>
            <a href="/downloads/scamguard-chrome-extension.zip" className={`${buttonVariants({ variant: "outline" })} hover-lift hidden md:inline-flex`} download>
              <Download data-icon="inline-start" /> Extension
            </a>
            <Link href="/audit" className={`${buttonVariants()} hover-lift`}>Sybil Analysis</Link>
          </div>
        </header>

        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(540px,1.18fr)] lg:items-start lg:pb-24 lg:pt-16">
          <div className="reveal-up flex flex-col gap-7 pt-1">
            <div className="inline-flex w-fit items-center gap-2 rounded-md border border-primary/25 bg-primary/[0.07] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-sky-200">
              <span className="size-1.5 rounded-full bg-emerald-400" /> Pre-sign security workspace
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.06] text-balance text-white sm:text-5xl">
              Review every Web3 request before you sign.
            </h1>
            <p className="max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Scan a link, wallet, mint, contract, or transaction request. ScamGuard combines intent decoding, source intelligence, live chain context, and passive page analysis into one explainable decision.
            </p>
            <div className="grid max-w-xl gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-3">
              {[
                ["Before signing", "request intent"],
                ["Across chains", "Solana + EVM"],
                ["With evidence", "not a black box"],
              ].map(([value, label]) => (
                <div key={label} className="bg-slate-950/55 px-4 py-4 backdrop-blur">
                  <p className="text-sm font-semibold text-white">{value}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.1em] text-slate-400">{label}</p>
                </div>
              ))}
            </div>
            <div className="max-w-xl border-l-2 border-primary/50 pl-4 text-sm leading-6 text-slate-400">
              ScamGuard never asks for a seed phrase or private key. A safe result lowers risk; it is not a guarantee. Every warning includes the evidence and the next safest action.
            </div>
          </div>

          <Card id="scan" className="glass-panel data-scan reveal-up delay-200 rounded-lg border-white/15 bg-[#081426]/95 shadow-2xl shadow-black/35">
            <CardHeader className="border-b border-white/10 pb-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">New scan</p>
                  <CardTitle className="mt-2 text-2xl tracking-tight">Risk review workspace</CardTitle>
                  <CardDescription className="mt-1 max-w-lg">
                    Select the surface, add optional wallet context, then review a decision built from inspectable evidence.
                  </CardDescription>
                </div>
                <Badge variant="outline" className={cn("gap-2 rounded-md px-3 py-1.5", result ? statusTone(result.riskLevel) : "border-primary/30 text-primary")}>
                  <span className="pulse-dot" /> {result ? statusLabel(result.riskLevel) : "Ready"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="rounded-md border border-white/10 bg-slate-950/45 px-3 py-2.5 text-sm text-slate-300">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Optional wallet context</p>
                  {connectedWallet ? (
                    <span className="break-all font-mono text-primary">{connectedWallet}</span>
                  ) : (
                    <span>No wallet connected. The scanner works without it.</span>
                  )}
                </div>
                <Button type="button" variant="outline" className="text-white" onClick={connectWallet}>
                  <PlugZap data-icon="inline-start" /> Connect Wallet
                </Button>
              </div>
              {walletMessage && <p className="text-sm text-muted-foreground">{walletMessage}</p>}

              <div className="grid gap-2 rounded-md border border-white/10 bg-slate-950/35 p-2 sm:grid-cols-2">
                {[
                  ["solana", "Solana", "Phantom, Backpack, SPL mints"] as const,
                  ["evm", "EVM", "MetaMask, Rabby, Base, Ethereum"] as const,
                ].map(([item, label, detail]) => (
                  <Button
                    key={item}
                    type="button"
                    variant={chain === item ? "secondary" : "outline"}
                    className={cn("h-auto justify-start gap-3 py-3 text-left", chain === item && "border-primary/30 bg-primary/10 text-primary")}
                    onClick={() => selectChain(item)}
                  >
                    <ShieldCheck className="size-4" />
                    <span className="grid gap-0.5">
                      <span>{label}</span>
                      <span className="text-xs font-normal text-muted-foreground">{detail}</span>
                    </span>
                  </Button>
                ))}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">Quick checks</p>
                  <p className="text-xs text-slate-500">Load a sample without connecting a wallet.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {scanPresets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      aria-label={`${preset.label}: ${preset.detail}`}
                      className="rounded-md border border-white/10 bg-slate-950/35 px-3 py-2.5 text-left transition hover:border-primary/40 hover:bg-primary/5"
                      onClick={() => loadPreset(preset)}
                    >
                      <span className="block text-sm font-medium text-white">{preset.label}</span>
                      <span className="sr-only">{preset.detail}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">What are you checking?</p>
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
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{modeConfig[mode].helper}</span>
                  <button type="button" className="text-primary hover:underline" onClick={() => setInput((chain === "evm" ? evmExamples : examples)[mode])}>
                    Load example
                  </button>
                </div>
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  className="min-h-32 border-white/10 bg-slate-950/40 font-mono text-sm"
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

              {!result && (
                <div className="rounded-md border border-dashed border-white/15 bg-slate-950/25 px-4 py-3 text-sm text-slate-400">
                  Your result will show the decision, confidence, source reputation, and the strongest evidence behind it.
                </div>
              )}

              <div className={cn("rounded-md border border-white/10 bg-[#07101f]/85 p-4", !result && "hidden")}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs uppercase tracking-[0.16em] text-primary">Risk decision</p>
                      <Badge variant="outline" className={cn(result ? statusTone(result.riskLevel) : "border-primary/30 text-primary")}>
                        {result ? statusLabel(result.riskLevel) : "Ready"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-base font-semibold leading-6 text-white">
                      {result?.metadata.decision?.userMessage ?? result?.summary ?? "Run a scan to see ScamGuard risk signals, recommended actions, and RPC metadata."}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {result ? primaryReason(result) : "ScamGuard will show the strongest driver, confidence, and next step here."}
                    </p>
                  </div>
                  <div className="w-full rounded-md border border-white/10 bg-slate-950/65 p-4 lg:w-40">
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Shield</p>
                    <div className="mt-2 flex items-end gap-2">
                      <span className="text-4xl font-semibold text-white">{result ? securityScore : "--"}</span>
                      <span className="pb-1 text-xs text-muted-foreground">/100</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          result?.riskLevel === "CRITICAL" || result?.riskLevel === "HIGH_RISK" ? "bg-red-400" : result?.riskLevel === "CAUTION" ? "bg-amber-300" : "bg-emerald-400",
                        )}
                        style={{ width: `${result ? securityScore : 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
                  {resultMetricRows(result).map(([label, value]) => (
                    <span key={label} className="rounded-md border border-white/10 bg-slate-950/35 px-3 py-2">
                      <strong className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</strong>
                      <span className="mt-1 block break-words text-slate-300">{value}</span>
                    </span>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
                  <section className="rounded-md border border-white/10 bg-slate-950/35 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="flex items-center gap-2 text-sm font-medium text-primary"><FileSearch className="size-4" /> Signals</p>
                      <span className="text-xs text-muted-foreground">{result ? `${result.signals.length} found` : "Waiting"}</span>
                    </div>
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1 text-sm text-muted-foreground">
                      {(result?.signals ?? []).map((signal) => (
                        <div key={signal.code} className={cn("rounded-lg border p-3", severityTone(signal.severity))}>
                          <p className="font-medium text-white">{signal.title}</p>
                          <p className="mt-1 leading-5">{signal.detail}</p>
                        </div>
                      ))}
                      {!result && <p>No scan yet.</p>}
                    </div>
                  </section>

                  <section className="grid gap-3">
                    <div className="rounded-md border border-primary/20 bg-primary/[0.06] p-3">
                      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><CheckCircle2 className="size-4" /> What would make this safer?</p>
                      <ul className="space-y-2 text-sm leading-5 text-muted-foreground">
                        {saferSteps(result).map((step) => <li key={step}>- {step}</li>)}
                      </ul>
                    </div>
                    <div className="rounded-md border border-white/10 bg-slate-950/35 p-3 text-xs text-muted-foreground">
                      <p className="mb-2 font-medium text-white">Evidence layer</p>
                      <div className="grid gap-2">
                        <span>RPC: {result?.metadata.rpcStatus ?? "not_scanned"}</span>
                        <span>Sources: {dataSourceLabel(result)}</span>
                        {result?.metadata.signatureCount !== undefined && <span>Signatures sampled: {result.metadata.signatureCount}</span>}
                        {result?.metadata.ownerProgram && <span>Owner: {shortValue(result.metadata.ownerProgram)}</span>}
                        {result?.metadata.rpcError && <span>RPC note: {result.metadata.rpcError}</span>}
                        {result?.metadata.domainIntelligence?.features?.length ? <span>Domain features: {result.metadata.domainIntelligence.features.join(", ")}</span> : null}
                        {result?.metadata.sandbox && (
                          <span>
                            URL Sandbox: {result.metadata.sandbox.status}
                            {result.metadata.sandbox.httpStatus ? ` · HTTP ${result.metadata.sandbox.httpStatus}` : ""}
                            {` · ${result.metadata.sandbox.elapsedMs} ms`}
                            {result.metadata.sandbox.contentBytes !== undefined ? ` · ${Math.ceil(result.metadata.sandbox.contentBytes / 1024)} KB` : ""}
                          </span>
                        )}
                        {result?.metadata.sandbox?.finalUrl && <span>Sandbox destination: {result.metadata.sandbox.finalUrl}</span>}
                        {result?.metadata.sandbox?.redirectChain.length ? <span>Validated redirects: {result.metadata.sandbox.redirectChain.length}</span> : null}
                        {result?.metadata.sandbox?.behaviorFlags.length ? <span>Static behaviors: {result.metadata.sandbox.behaviorFlags.join(", ")}</span> : null}
                        {result?.metadata.sandbox?.blockReason && <span>Sandbox policy: {result.metadata.sandbox.blockReason}</span>}
                        {result?.metadata.sandbox?.error && <span>Sandbox note: {result.metadata.sandbox.error}</span>}
                        {result?.metadata.scamDna && (
                          <span>
                            Scam DNA: {result.metadata.scamDna.match.matched
                              ? result.metadata.scamDna.match.crossDomain
                                ? `${Math.round(result.metadata.scamDna.match.similarity * 100)}% cross-domain match${result.metadata.scamDna.match.matchedDomain ? ` with ${result.metadata.scamDna.match.matchedDomain}` : ""}`
                                : "current-site baseline only; this is not a clone signal"
                              : "new fingerprint with no corroborated campaign match"}
                          </span>
                        )}
                        {result?.metadata.scamDna?.match.evidence.length && result.metadata.scamDna.match.crossDomain ? <span>DNA evidence: {result.metadata.scamDna.match.evidence.join(", ")}</span> : null}
                        {result?.metadata.contractIntelligence?.target && <span>Contract target: {shortValue(result.metadata.contractIntelligence.target)}</span>}
                        {result?.metadata.decodedIntent?.warnings?.map((warning) => <span key={warning}>Decode note: {warning}</span>)}
                        {result?.metadata.reputation?.notes?.map((note) => <span key={note}>Reputation: {note}</span>)}
                        {result?.metadata.contractIntelligence?.notes?.map((note) => <span key={note}>Contract intel: {note}</span>)}
                      </div>
                    </div>
                    {result && (
                      <div className="rounded-md border border-white/10 bg-slate-950/35 p-3">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Feedback loop</p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-4 lg:grid-cols-2">
                          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => void submitFeedback("reported_safe")}>Looks safe</Button>
                          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => void submitFeedback("reported_scam")}>Report scam</Button>
                          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => void submitFeedback("false_positive")}>False positive</Button>
                          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => void submitFeedback("false_negative")}>Missed risk</Button>
                        </div>
                        {feedbackMessage && <p className="mt-3 text-xs text-muted-foreground">{feedbackMessage}</p>}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="extension" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">Browser and chat layer</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-white sm:text-5xl">
              Protection where risky requests actually happen.
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              The Chrome extension protects live browsing sessions, while the Telegram bot brings the same explained scans into chat. Both use the server-side ScamGuard engine and never request secret wallet material.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <a href="/downloads/scamguard-chrome-extension.zip" className={`${buttonVariants()} glow-primary hover-lift`} download>
                <Download data-icon="inline-start" /> Download Chrome extension
              </a>
              <Link href="/docs/api" className={`${buttonVariants({ variant: "outline" })} hover-lift`}>
                API docs <ArrowRight data-icon="inline-end" />
              </Link>
              <a href={scamGuardTelegramBotUrl} target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: "outline" })} hover-lift`}>
                <Send data-icon="inline-start" /> Open Telegram bot
              </a>
            </div>
            <div className="mt-6 rounded-md border border-white/10 bg-slate-950/35 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-primary">Protection profiles</p>
              <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                {["Balanced warns on high-risk flows.", "Strict escalates caution-level signing.", "Paranoid reviews every signing request."].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-primary" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-5">
            <div className="rounded-lg border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-black/25">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                    <Puzzle className="size-5 text-primary" />
                  </span>
                  <div>
                    <p className="font-semibold text-white">ScamGuard Extension</p>
                    <p className="text-xs text-muted-foreground">Pre-sign intelligence</p>
                  </div>
                </div>
                <Badge variant="outline" className="border-emerald-400/40 text-emerald-200">Safe</Badge>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-[0.88fr_1.12fr]">
                <div className="rounded-lg border border-border bg-background/55 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-primary">Current site</p>
                  <p className="mt-2 text-2xl font-semibold text-white">zerg.app</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">No major threat pattern surfaced. Keep matching the wallet prompt to your intent.</p>
                  <div className="mt-4 h-2 rounded-full bg-slate-800">
                    <div className="h-full w-[92%] rounded-full bg-emerald-400" />
                  </div>
                </div>
                <div className="grid gap-3">
                  {[
                    [FileSearch, "Scan page links", "Inline badges mark caution and high-risk links."],
                    [ShieldAlert, "Pre-sign overlay", "Critical requests block before the wallet continues."],
                    [Settings2, "Local controls", "Balanced, Strict, and Paranoid profiles."],
                  ].map(([Icon, title, text]) => (
                    <div key={title as string} className="flex items-start gap-3 rounded-lg border border-border bg-background/45 p-3">
                      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                      <div>
                        <p className="font-medium text-white">{title as string}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{text as string}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="glass-panel rounded-lg border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><PackageCheck className="text-primary" /> Install flow</CardTitle>
              <CardDescription>Until the Chrome Web Store listing is ready, install the unpacked extension from the downloadable package.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-3 text-sm text-muted-foreground">
                {[
                  "Download the ScamGuard Chrome extension ZIP.",
                  "Unzip the package on your computer.",
                  "Open chrome://extensions and enable Developer mode.",
                  "Click Load unpacked and select the unzipped extension folder.",
                  "Open any Solana or EVM dApp page; the ScamGuard banner and toolbar popup will appear.",
                ].map((step, index) => (
                  <li key={step} className="flex gap-3 rounded-lg border border-border bg-background/45 p-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 font-mono text-xs text-primary">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card className="glass-panel rounded-lg border-white/10">
            <CardHeader>
              <CardTitle>What the extension sends</CardTitle>
              <CardDescription>Designed for pre-sign safety without touching secret material.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {[
                "Current page URL and visible page links for risk checks.",
                "Transaction text, serialized Solana payloads, or EVM wallet request JSON that the dApp asks the wallet to sign.",
                "Connected wallet public key when available as optional scan context.",
                "Never seed phrases, private keys, wallet passwords, or wallet extension internal pages.",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-lg border border-border bg-background/45 p-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <h2 className="text-3xl font-semibold text-white sm:text-5xl">ScamGuard Intelligence Network</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Strong detection comes from layered context, not one community report button. ScamGuard separates trusted project context from risky wallet intent so legitimate apps are not punished for using campaign or claim language.
            </p>
          </div>
          <div className="grid gap-3">
            {intelligenceNetwork.map(([title, text], index) => (
              <div key={title} className="grid gap-3 rounded-lg border border-border bg-background/45 p-4 sm:grid-cols-[42px_1fr]">
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
        </div>
      </section>

      <section className="border-y border-border bg-primary/[0.03]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="mb-8 grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <h2 className="text-3xl font-semibold text-white sm:text-5xl">Explainable risk methodology</h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                Every result is framed as a risk decision with confidence, primary reason, data sources, and next action. The user sees why ScamGuard warned instead of only seeing a scary number.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-4 text-sm leading-6 text-muted-foreground">
              ScamGuard is a pre-sign protection layer. It does not claim certainty; it gives the user and partner apps a defensible, evidence-backed pause before risky interactions.
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {methodologySteps.map(([Icon, title, text]) => (
              <div key={title} className="rounded-lg border border-border bg-card/70 p-5">
                <Icon className="mb-4 size-5 text-primary" />
                <p className="font-semibold text-white">{title}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-16 sm:px-8 lg:grid-cols-[0.78fr_1.22fr]">
          <div>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">Embed ScamGuard inside wallets, launchpads, and Web3 dApps.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Partners can call one authenticated endpoint for every scan type, or use the public scanner endpoints for lightweight UI flows.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              [Code2, "POST /api/v1/scamguard/scan", "Authenticated B2B endpoint using the existing TRIPROOF_API_KEY bearer flow."],
              [ClipboardCheck, "Pre-sign payloads", "Send instruction text, base64 serialized Solana transactions, or EVM wallet request JSON."],
              [Fingerprint, "Mint authority checks", "When RPC is configured, mint and freeze authorities are inspected server-side."],
              [ExternalLink, "Public scan endpoints", "/api/scamguard/scan-url, scan-wallet, scan-token, and scan-transaction power the product UI."],
            ].map(([Icon, title, text]) => (
              <div key={title as string} className="hover-lift rounded-lg border border-border bg-card/70 p-5">
                <Icon className="mb-4 text-primary" />
                <p className="font-semibold">{title as string}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text as string}</p>
              </div>
            ))}
          </div>
          <div className="lg:col-start-2">
            <pre className="overflow-x-auto rounded-lg border border-border bg-slate-950/80 p-5 text-xs leading-6 text-slate-300">
{`POST /api/v1/scamguard/scan
Authorization: Bearer <TRIPROOF_API_KEY>

{
  "type": "transaction",
  "chain": "evm",
  "value": "{ wallet request JSON }",
  "sourceUrl": "https://app.project.xyz/claim"
}

{
  "riskLevel": "HIGH_RISK",
  "confidence": "HIGH",
  "metadata": {
    "decision": {
      "primaryReason": "Unlimited approval to an unknown spender",
      "userMessage": "Review this request before signing."
    }
  }
}`}
            </pre>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="glass-panel premium-card flex flex-col items-start justify-between gap-6 rounded-lg p-8 md:flex-row md:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Unified product layer</p>
            <h2 className="text-gradient mt-3 text-2xl font-semibold sm:text-3xl">Wallet risk plus ScamGuard risk gives teams one security story.</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Use Sybil scoring for campaign eligibility, ScamGuard scoring for pre-sign safety, and the combined dashboard score for fast operational decisions.
            </p>
          </div>
          <Link href="/audit" className={`${buttonVariants()} glow-primary hover-lift`}>
            Open Sybil Analysis <ArrowRight data-icon="inline-end" />
          </Link>
        </div>
      </section>
    </main>
  )
}
