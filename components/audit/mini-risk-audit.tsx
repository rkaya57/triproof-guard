"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileSearch,
  Gauge,
  Mail,
  Network,
  ShieldX,
  Sparkles,
  Upload,
  WalletCards,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { formatNumber } from "@/lib/format"

type AuditWallet = {
  address: string
  valid: boolean
  risk: "low" | "medium" | "high"
  decision: "sample_ok" | "review" | "exclude"
  reasonCodes: string[]
}

const sampleWallets = [
  "0x0000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000002",
  "0x0000000000000000000000000000000000000003",
  "Ch8kCo2FW4HXQMTm2wpbLeaVZJxXa4Rg8S4KVXUxcdVm",
  "DNfVbKqY2d4uGz9jMx3YcJqS2f4Q7w8e9rT1yUiopLmN",
  "bad-wallet-row",
  "0x0000000000000000000000000000000000000001",
].join("\n")

function parseLines(value: string) {
  return value
    .split(/[\n,;\t ]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function isValidWallet(address: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(address) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
}

function shortAddress(address: string) {
  if (address.length <= 16) return address
  return `${address.slice(0, 8)}...${address.slice(-5)}`
}

function inspectWallet(address: string, duplicate: boolean, nearbySimilar: number): AuditWallet {
  const valid = isValidWallet(address)
  const reasonCodes: string[] = []
  if (!valid) reasonCodes.push("INVALID_FORMAT")
  if (duplicate) reasonCodes.push("DUPLICATE_ROW")
  if (nearbySimilar >= 4) reasonCodes.push("SIMILAR_PREFIX_CLUSTER")
  if (/^0x0{28,}/i.test(address)) reasonCodes.push("SYNTHETIC_LOOKING_EVM")
  if (valid && !duplicate && nearbySimilar < 4) reasonCodes.push("READY_FOR_FULL_ANALYSIS")

  const severity = !valid || duplicate || nearbySimilar >= 8 ? "high" : nearbySimilar >= 4 ? "medium" : "low"
  return {
    address,
    valid,
    risk: severity,
    decision: severity === "high" ? "exclude" : severity === "medium" ? "review" : "sample_ok",
    reasonCodes,
  }
}

function analyzeInput(value: string) {
  const lines = parseLines(value)
  const counts = new Map<string, number>()
  const prefixCounts = new Map<string, number>()

  lines.forEach((address) => {
    const normalized = address.toLowerCase()
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
    prefixCounts.set(normalized.slice(0, 10), (prefixCounts.get(normalized.slice(0, 10)) ?? 0) + 1)
  })

  const wallets = lines.map((address) => {
    const normalized = address.toLowerCase()
    return inspectWallet(address, (counts.get(normalized) ?? 0) > 1, prefixCounts.get(normalized.slice(0, 10)) ?? 0)
  })

  const invalid = wallets.filter((wallet) => !wallet.valid).length
  const duplicates = Array.from(counts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0)
  const review = wallets.filter((wallet) => wallet.decision === "review").length
  const exclude = wallets.filter((wallet) => wallet.decision === "exclude").length
  const clean = wallets.filter((wallet) => wallet.decision === "sample_ok").length
  const score = Math.max(0, Math.min(100, Math.round(100 - invalid * 12 - duplicates * 10 - review * 4 - exclude * 9)))

  return {
    wallets,
    total: lines.length,
    unique: counts.size,
    invalid,
    duplicates,
    review,
    exclude,
    clean,
    score,
  }
}

function decisionTone(decision: AuditWallet["decision"]) {
  if (decision === "sample_ok") return "border-green-400/30 bg-green-400/10 text-green-200"
  if (decision === "review") return "border-amber-400/30 bg-amber-400/10 text-amber-200"
  return "border-red-400/30 bg-red-400/10 text-red-200"
}

function buildMiniAuditBrief(report: ReturnType<typeof analyzeInput>) {
  const findings = report.wallets
    .slice(0, 12)
    .map((wallet) => `- ${wallet.address}: ${wallet.decision} (${wallet.reasonCodes.join(", ")})`)
    .join("\n")

  return [
    "Tri-Proof Guard Mini Wallet Risk Audit",
    "",
    `Sample quality: ${report.score}/100`,
    `Rows: ${report.total}`,
    `Unique wallets: ${report.unique}`,
    `Sample OK: ${report.clean}`,
    `Needs review: ${report.review}`,
    `Exclude from sample: ${report.exclude}`,
    `Invalid rows: ${report.invalid}`,
    `Duplicate rows: ${report.duplicates}`,
    "",
    "First-pass findings:",
    findings || "- No wallet rows supplied.",
    "",
    "Note: This browser-only mini audit is a pre-analysis signal. Full Tri-Proof Guard analysis adds on-chain enrichment, campaign policy, cluster graph evidence, review workflow and exportable clean-list proof.",
  ].join("\n")
}

export function MiniRiskAudit() {
  const [walletInput, setWalletInput] = useState(sampleWallets)
  const report = useMemo(() => analyzeInput(walletInput), [walletInput])
  const brief = useMemo(() => buildMiniAuditBrief(report), [report])
  const mailto = useMemo(
    () =>
      `mailto:info@triproofprotocol.com?subject=${encodeURIComponent("Free Mini Wallet Risk Audit Review")}&body=${encodeURIComponent(brief)}`,
    [brief]
  )
  const hasInput = report.total > 0

  function downloadBrief() {
    const blob = new Blob([brief], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "triproof-mini-audit-brief.txt"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="glass-panel premium-card animated-border rounded-3xl p-5">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="border-primary/30 bg-primary/10 text-cyan-100">
            Free mini wallet risk audit
          </Badge>
          <Badge variant="outline" className="border-green-400/30 bg-green-400/10 text-green-200">
            Browser-only sample
          </Badge>
        </div>
        <h1 className="text-gradient text-4xl font-semibold sm:text-5xl">
          Paste 100-500 campaign wallets and get a first-pass risk read.
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          This mini audit checks list quality, duplicates, invalid rows and simple clustering hints. Full Guard analysis still runs the on-chain enrichment and decision engine.
        </p>

        <div className="mt-6 grid gap-3">
          <label className="grid gap-2 text-sm font-medium">
            Wallet list
            <Textarea
              value={walletInput}
              onChange={(event) => setWalletInput(event.target.value)}
              rows={12}
              className="font-mono text-xs"
              placeholder="Paste one wallet address per line"
            />
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => setWalletInput(sampleWallets)} className={buttonVariants({ variant: "outline" })}>
              <ClipboardPaste data-icon="inline-start" />
              Load sample
            </button>
            <Link href="/dashboard/new-analysis" className={`${buttonVariants()} glow-primary`}>
              <Upload data-icon="inline-start" />
              Run full analysis
            </Link>
            <a
              href={mailto}
              className={buttonVariants({ variant: "outline" })}
            >
              <Mail data-icon="inline-start" />
              Request review
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-5">
        <Card className="glass-panel premium-card animated-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="text-primary" />
              Mini audit score
            </CardTitle>
            <CardDescription>Fast signal for sales calls and pre-analysis triage. No data is submitted from this widget.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-primary/25 bg-primary/10 p-4 sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Sample quality</p>
              <p className="mt-1 text-4xl font-semibold text-primary">{hasInput ? report.score : 0}/100</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {report.score >= 80 ? "Ready for full Guard analysis." : report.score >= 55 ? "Needs cleanup before distribution." : "High-risk or malformed sample."}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-4">
              <WalletCards className="mb-2 text-primary" />
              <p className="text-2xl font-semibold">{formatNumber(report.total)}</p>
              <p className="text-xs text-muted-foreground">Rows</p>
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-4">
              <Network className="mb-2 text-primary" />
              <p className="text-2xl font-semibold">{formatNumber(report.unique)}</p>
              <p className="text-xs text-muted-foreground">Unique wallets</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="glass-panel border-green-400/25 bg-green-400/10">
            <CardHeader>
              <CheckCircle2 className="text-green-300" />
              <CardTitle className="text-green-100">{formatNumber(report.clean)}</CardTitle>
              <CardDescription>Sample OK</CardDescription>
            </CardHeader>
          </Card>
          <Card className="glass-panel border-amber-400/25 bg-amber-400/10">
            <CardHeader>
              <AlertTriangle className="text-amber-300" />
              <CardTitle className="text-amber-100">{formatNumber(report.review)}</CardTitle>
              <CardDescription>Needs review</CardDescription>
            </CardHeader>
          </Card>
          <Card className="glass-panel border-red-400/25 bg-red-400/10">
            <CardHeader>
              <ShieldX className="text-red-300" />
              <CardTitle className="text-red-100">{formatNumber(report.exclude)}</CardTitle>
              <CardDescription>Exclude from sample</CardDescription>
            </CardHeader>
          </Card>
        </div>

        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="text-primary" />
              First-pass findings
            </CardTitle>
            <CardDescription>Reason codes are intentionally compact so they can later map to API and clean-list exports.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {report.wallets.slice(0, 8).map((wallet, index) => (
              <div key={`${wallet.address}-${index}`} className="grid gap-3 rounded-lg border border-border bg-background/45 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{shortAddress(wallet.address)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {wallet.reasonCodes.map((code) => (
                      <Badge key={code} variant="outline" className="border-primary/25 bg-primary/5 font-mono text-[10px] text-primary">
                        {code}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Badge variant="outline" className={decisionTone(wallet.decision)}>
                  {wallet.decision.replace("_", " ")}
                </Badge>
              </div>
            ))}
            {!hasInput && (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Paste a wallet list to generate a mini audit.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="text-primary" />
              Next best action
            </CardTitle>
            <CardDescription>
              Turn this sample into a defensible customer report with on-chain evidence, campaign policy and exportable clean lists.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Link href="/dashboard/new-analysis" className={`${buttonVariants()} glow-primary`}>
              Full Guard report
              <ArrowRight data-icon="inline-end" />
            </Link>
            <button type="button" onClick={downloadBrief} className={buttonVariants({ variant: "outline" })}>
              <Download data-icon="inline-start" />
              Download brief
            </button>
            <a href={mailto} className={buttonVariants({ variant: "outline" })}>
              <Mail data-icon="inline-start" />
              Email review
            </a>
            <Link href="/docs" className={buttonVariants({ variant: "outline" })}>
              Read methodology
            </Link>
            <Link href="/contact" className={buttonVariants({ variant: "outline" })}>
              Talk to us
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
