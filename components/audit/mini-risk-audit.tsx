"use client"

import Link from "next/link"
import { FormEvent, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileSearch,
  Gauge,
  Loader2,
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
import { decisionExplanation, decisionLabel } from "@/lib/decision-labels"
import { formatNumber } from "@/lib/format"
import type { AnalysisResult, Chain, CsvIssue, RiskPolicy, WalletRiskResult, WalletStatus } from "@/types"

type MiniAuditResponse = {
  status: "completed"
  source: string
  chain: Chain
  campaignType: string
  riskPolicy: RiskPolicy
  engineMode: string
  limit: number
  parseSummary: {
    mode: "basic" | "enriched"
    validWallets: number
    issues: CsvIssue[]
    duplicates: CsvIssue[]
  }
  result: AnalysisResult
}

const sampleWallets = [
  "0x8f3c2a6b4e9d1f705c8a9b2d3e4f5061728394ab",
  "0x4c1a9e8b7d6f5032a1b0c9d8e7f6543210ab9cde",
  "0xa2b4c6d8e0f13579bdf2468ace13579bdf2468ac",
  "0x19f8e7d6c5b4a3928172635445362718f9e8d7c6",
  "0x0000000000000000000000000000000000000001",
  "bad-wallet-row",
].join("\n")

const selectClass =
  "h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

function shortAddress(address: string) {
  if (address.length <= 16) return address
  return `${address.slice(0, 8)}...${address.slice(-5)}`
}

function displayStatus(status: WalletStatus) {
  return decisionLabel(status)
}

function statusTone(status: WalletStatus) {
  if (status === "approved") return "border-green-400/30 bg-green-400/10 text-green-200"
  if (status === "manual_review") return "border-amber-400/30 bg-amber-400/10 text-amber-200"
  return "border-red-400/30 bg-red-400/10 text-red-200"
}

function buildMiniAuditBrief(report: MiniAuditResponse | null, walletInput: string) {
  if (!report) {
    return [
      "Tri-Proof Guard Mini Wallet Risk Audit",
      "",
      "No engine result has been generated yet.",
      "",
      "Wallet sample:",
      walletInput.trim() || "- No wallet rows supplied.",
    ].join("\n")
  }

  const findings = report.result.wallets
    .slice(0, 12)
    .map((wallet) => `- ${wallet.walletAddress}: ${wallet.status} / risk ${wallet.riskScore} (${wallet.reasons.slice(0, 3).join("; ")})`)
    .join("\n")

  return [
    "Tri-Proof Guard Mini Wallet Risk Audit",
    "",
    `Source: ${report.source}`,
    `Chain: ${report.chain}`,
    `Risk policy: ${report.riskPolicy}`,
    `Engine mode: ${report.engineMode}`,
    `Wallets analyzed: ${report.result.totalWallets}`,
    `Average risk score: ${report.result.averageRiskScore}/100`,
    `${decisionLabel("approved")}: ${report.result.approvedCount}`,
    `${decisionLabel("manual_review")}: ${report.result.manualReviewCount}`,
    `${decisionLabel("rejected")}: ${report.result.rejectedCount}`,
    `Parse issues: ${report.parseSummary.issues.length}`,
    `Duplicates skipped: ${report.parseSummary.duplicates.length}`,
    "",
    "First-pass engine findings:",
    findings || "- No wallet rows supplied.",
    "",
    "Note: This public mini audit runs the Tri-Proof Guard decision engine immediately. Full Guard analysis adds account history persistence, queue processing, review workflow, exports and clean-list proof.",
  ].join("\n")
}

function walletSortValue(wallet: WalletRiskResult) {
  if (wallet.status === "rejected") return 3
  if (wallet.status === "manual_review") return 2
  return 1
}

export function MiniRiskAudit() {
  const [walletInput, setWalletInput] = useState(sampleWallets)
  const [chain, setChain] = useState<Chain>("Ethereum")
  const [riskPolicy, setRiskPolicy] = useState<RiskPolicy>("strict")
  const [report, setReport] = useState<MiniAuditResponse | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  const brief = useMemo(() => buildMiniAuditBrief(report, walletInput), [report, walletInput])
  const mailto = useMemo(
    () =>
      `mailto:info@triproofprotocol.com?subject=${encodeURIComponent("Mini Guard Engine Audit Review")}&body=${encodeURIComponent(brief)}`,
    [brief]
  )
  const wallets = useMemo(
    () =>
      [...(report?.result.wallets ?? [])]
        .sort((left, right) => walletSortValue(right) - walletSortValue(left) || right.riskScore - left.riskScore)
        .slice(0, 8),
    [report]
  )

  async function runMiniAudit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    setPending(true)
    setError("")

    try {
      const response = await fetch("/api/audit/mini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletInput, chain, riskPolicy, campaignType: "Airdrop" }),
      })
      const body = (await response.json().catch(() => ({}))) as Partial<MiniAuditResponse> & { error?: string }
      if (!response.ok || !body.result) {
        throw new Error(body.error ?? "Mini audit could not run.")
      }
      setReport(body as MiniAuditResponse)
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Mini audit could not run.")
    } finally {
      setPending(false)
    }
  }

  function downloadBrief() {
    const blob = new Blob([brief], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "triproof-mini-engine-audit.txt"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="glass-panel premium-card animated-border rounded-3xl p-5">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="border-primary/30 bg-primary/10 text-cyan-100">
            Free Guard engine trial
          </Badge>
          <Badge variant="outline" className="border-green-400/30 bg-green-400/10 text-green-200">
            Real decision engine
          </Badge>
        </div>
        <h1 className="text-gradient text-4xl font-semibold sm:text-5xl">
          Paste campaign wallets and run a real Tri-Proof engine preview.
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          This public mini audit submits the sample to Tri-Proof Guard&apos;s server-side decision engine with a strict first-pass policy. If an on-chain provider is configured, the preview enriches the sample before scoring; otherwise it clearly falls back to engine-only scoring.
        </p>

        <form onSubmit={runMiniAudit} className="mt-6 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Chain
              <select value={chain} onChange={(event) => setChain(event.target.value as Chain)} className={selectClass}>
                {["Ethereum", "Base", "Arbitrum", "Optimism", "Polygon", "BNB Chain", "Solana"].map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Risk policy
              <select value={riskPolicy} onChange={(event) => setRiskPolicy(event.target.value as RiskPolicy)} className={selectClass}>
                <option value="strict">Strict</option>
                <option value="balanced">Balanced</option>
                <option value="conservative">Conservative</option>
              </select>
            </label>
          </div>

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

          {error && <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</div>}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="submit" disabled={pending} className={`${buttonVariants()} glow-primary`}>
              {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Gauge data-icon="inline-start" />}
              Run engine audit
            </button>
            <button type="button" onClick={() => setWalletInput(sampleWallets)} className={buttonVariants({ variant: "outline" })}>
              <ClipboardPaste data-icon="inline-start" />
              Load sample
            </button>
            <Link href="/dashboard/new-analysis" className={buttonVariants({ variant: "outline" })}>
              <Upload data-icon="inline-start" />
              Full analysis
            </Link>
          </div>
        </form>
      </section>

      <section className="grid gap-5">
        <Card className="glass-panel premium-card animated-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="text-primary" />
              Engine result
            </CardTitle>
            <CardDescription>
              {report
                ? `${report.source} completed with ${report.engineMode} mode on ${report.chain}.`
                : "Run the mini audit to get a live Guard engine result."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-primary/25 bg-primary/10 p-4 sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Average risk score</p>
              <p className="mt-1 text-4xl font-semibold text-primary">{report ? report.result.averageRiskScore : 0}/100</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {report
                  ? report.engineMode === "onchain"
                    ? "Scored with live enrichment where provider data was available."
                    : "Scored by the Guard engine without live on-chain enrichment."
                  : "No result yet."}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-4">
              <WalletCards className="mb-2 text-primary" />
              <p className="text-2xl font-semibold">{formatNumber(report?.result.totalWallets)}</p>
              <p className="text-xs text-muted-foreground">Analyzed</p>
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-4">
              <Network className="mb-2 text-primary" />
              <p className="text-2xl font-semibold">{formatNumber(report?.result.clusters.length)}</p>
              <p className="text-xs text-muted-foreground">Clusters</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="glass-panel border-green-400/25 bg-green-400/10">
            <CardHeader>
              <CheckCircle2 className="text-green-300" />
              <CardTitle className="text-green-100">{formatNumber(report?.result.approvedCount)}</CardTitle>
              <CardDescription>Approved candidates</CardDescription>
            </CardHeader>
          </Card>
          <Card className="glass-panel border-amber-400/25 bg-amber-400/10">
            <CardHeader>
              <AlertTriangle className="text-amber-300" />
              <CardTitle className="text-amber-100">{formatNumber(report?.result.manualReviewCount)}</CardTitle>
              <CardDescription title={decisionExplanation("manual_review")}>Gray Zone</CardDescription>
            </CardHeader>
          </Card>
          <Card className="glass-panel border-red-400/25 bg-red-400/10">
            <CardHeader>
              <ShieldX className="text-red-300" />
              <CardTitle className="text-red-100">{formatNumber(report?.result.rejectedCount)}</CardTitle>
              <CardDescription title={decisionExplanation("rejected")}>Rejected / Not Eligible</CardDescription>
            </CardHeader>
          </Card>
        </div>

        {report?.result.enrichment && (
          <Card className="glass-panel premium-card">
            <CardHeader>
              <CardTitle>Provider evidence</CardTitle>
              <CardDescription>
                Provider: {report.result.enrichment.provider}. Enriched {formatNumber(report.result.enrichment.enrichedCount)}, failed {formatNumber(report.result.enrichment.failedCount)}, cache hits {formatNumber(report.result.enrichment.cacheHits)}.
              </CardDescription>
            </CardHeader>
            {report.result.enrichment.warnings.length > 0 && (
              <CardContent className="grid gap-2">
                {report.result.enrichment.warnings.map((warning) => (
                  <div key={warning} className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100">
                    {warning}
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        )}

        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="text-primary" />
              Engine findings
            </CardTitle>
            <CardDescription>These statuses come from the same Guard scoring engine used by the full dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {wallets.map((wallet) => (
              <div key={wallet.walletAddress} className="grid gap-3 rounded-lg border border-border bg-background/45 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{shortAddress(wallet.walletAddress)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Risk {wallet.riskScore}/100 / {wallet.riskLevel}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {wallet.reasons.slice(0, 3).map((reason) => (
                      <Badge key={reason} variant="outline" className="border-primary/25 bg-primary/5 text-[10px] text-primary">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Badge variant="outline" className={statusTone(wallet.status)} title={decisionExplanation(wallet.status)}>
                  {displayStatus(wallet.status)}
                </Badge>
              </div>
            ))}
            {!report && (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Paste wallets and run the engine audit.
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
              Turn this engine preview into a defensible customer report with saved on-chain evidence, team review and exportable clean lists.
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
            <Link href="/docs/trust" className={buttonVariants({ variant: "outline" })}>
              Methodology
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
