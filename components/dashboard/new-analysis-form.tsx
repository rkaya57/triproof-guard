"use client"

import { ChangeEvent, DragEvent, FormEvent, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  Circle,
  DatabaseZap,
  Download,
  FileCheck2,
  FileText,
  FileUp,
  Info,
  Layers3,
  Loader,
  Loader2,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toast"
import { campaignTypes, supportedChains } from "@/lib/validators/wallet"

type RiskPolicy = "conservative" | "balanced" | "strict"
type AnalysisMode = "onchain" | "hybrid"

type CreateResponse = {
  analysisId?: string
  code?: string
  error?: string
  checkoutUrl?: string
  parseSummary?: {
    note: string
    validWallets: number
    issues: Array<{ row: number; issue: string }>
    duplicates: Array<{ row: number; issue: string }>
    warnings?: string[]
    riskPolicy?: RiskPolicy
  }
}

type CsvPreview = {
  name: string
  size: string
  rowCount: number
  columns: string[]
  mode: "basic" | "enriched"
  invalidCount: number
}

const selectClass =
  "h-10 w-full rounded-xl border border-input bg-background/55 px-3 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35"

const enrichedColumns = new Set([
  "funding_source",
  "tx_count",
  "wallet_age_days",
  "contract_interactions",
  "campaign_actions",
  "risk_flags",
  "policy_action",
  "policy",
  "decision",
  "reputation_label",
  "reputation",
  "review_label",
  "customer_label",
  "entity_label",
  "entity_type",
  "referrer_address",
  "referral_code",
  "referral_timestamp",
  "campaign_event_at",
  "campaign_event_type",
  "campaign_points",
  "participant_fingerprint",
])

const enrichableChains = new Set([
  "Ethereum",
  "Base",
  "Arbitrum",
  "Optimism",
  "Polygon",
  "BNB Chain",
  "Solana",
])

const enrichmentSteps = [
  "Parsing CSV",
  "Fetching real on-chain data",
  "Running policy-aware risk engine",
  "Generating report",
]

const riskPolicyDescriptions: Record<RiskPolicy, string> = {
  conservative: "Minimizes false exclusions and routes uncertain wallets to review.",
  balanced: "Recommended default for clean, gray-zone, and not-eligible separation.",
  strict: "Higher-protection mode that excludes weak or coordinated profiles faster.",
}

const riskPolicyLabels: Record<RiskPolicy, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  strict: "Strict",
}

const modeDescriptions: Record<AnalysisMode, string> = {
  onchain: "Fetch real wallet activity, age, funding source and interaction data from blockchain APIs. No synthetic CSV-only scoring is used.",
  hybrid: "Use uploaded CSV fields first and enrich missing data from blockchain APIs. No mock wallet history is generated.",
}

function splitCsvRow(row: string) {
  return row
    .split(",")
    .map((value) => value.trim().replace(/^"|"$/g, ""))
    .filter(Boolean)
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

async function buildCsvPreview(file: File): Promise<CsvPreview> {
  const text = await file.text()
  const rows = text.split(/\r?\n/).filter((row) => row.trim().length > 0)
  const columns = splitCsvRow(rows[0] ?? "")
  const normalizedColumns = columns.map((column) => column.toLowerCase())
  const walletColumnIndex = normalizedColumns.findIndex((column) =>
    ["wallet_address", "address", "wallet"].includes(column),
  )
  const dataRows = rows.slice(1)
  const invalidCount = walletColumnIndex < 0 ? dataRows.length : 0
  const mode = normalizedColumns.some((column) => enrichedColumns.has(column))
    ? "enriched"
    : "basic"
  return {
    name: file.name,
    size: formatFileSize(file.size),
    rowCount: dataRows.length,
    columns,
    mode,
    invalidCount,
  }
}

const sampleCsv = `wallet_address,referrer_address,referral_timestamp,campaign_event_at,campaign_event_type,campaign_points,participant_fingerprint
4V1C76x5SpQhYpZ3EnfHWxyaFmQy6GzwR8NhBpaALsPR,,2026-07-31T10:00:00Z,2026-07-31T10:05:00Z,swap,25,
7Zb1bJ6Qn3z2XxgR7K4pGv6fW8cY5mT9nL2sA3dE4fG,4V1C76x5SpQhYpZ3EnfHWxyaFmQy6GzwR8NhBpaALsPR,2026-07-31T10:01:00Z,2026-07-31T10:05:30Z,swap,25,cb9a8ba5a3c75dfa8c1d0c6e7c1ec89f
9xQeWvG816bUx9EPfvhkgqJQ3Z9H6uZq1JtV7mYz3Kk,4V1C76x5SpQhYpZ3EnfHWxyaFmQy6GzwR8NhBpaALsPR,2026-07-31T10:02:00Z,2026-07-31T10:06:00Z,swap,25,cb9a8ba5a3c75dfa8c1d0c6e7c1ec89f
`

function downloadSampleCsv() {
  const blob = new Blob([sampleCsv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = "tri-proof-sample-wallets.csv"
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function SectionHeading({
  step,
  title,
  description,
}: {
  step: string
  title: string
  description: string
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-cyan-300/14 bg-cyan-300/[0.045] font-mono text-[10px] font-semibold text-cyan-200">
        {step}
      </span>
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </div>
  )
}

export function NewAnalysisForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, setPending] = useState(false)
  const [progressSteps, setProgressSteps] = useState<string[]>([])
  const [progressIndex, setProgressIndex] = useState(0)
  const progressTimer = useRef<number | null>(null)
  const [error, setError] = useState("")
  const [note, setNote] = useState("")
  const [projectName, setProjectName] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<CsvPreview | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [campaignType, setCampaignType] = useState("Airdrop")
  const [chain, setChain] = useState("Ethereum")
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("onchain")
  const [riskPolicy, setRiskPolicy] = useState<RiskPolicy>("balanced")
  const [deepHistory, setDeepHistory] = useState(false)
  const chainSupportsEnrichment = enrichableChains.has(chain)

  async function acceptFile(file: File | null) {
    setError("")
    setNote("")
    if (!file) {
      setSelectedFile(null)
      setPreview(null)
      return
    }
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      setError("Please upload a CSV file.")
      setSelectedFile(null)
      setPreview(null)
      return
    }
    setSelectedFile(file)
    setPreview(await buildCsvPreview(file))
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    void acceptFile(event.target.files?.[0] ?? null)
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setIsDragging(false)
    void acceptFile(event.dataTransfer.files?.[0] ?? null)
  }

  useEffect(
    () => () => {
      if (progressTimer.current) window.clearInterval(progressTimer.current)
    },
    [],
  )

  function startProgress(stepCount: number) {
    if (progressTimer.current) window.clearInterval(progressTimer.current)
    progressTimer.current = window.setInterval(
      () => setProgressIndex((current) => Math.min(current + 1, stepCount - 1)),
      850,
    )
  }

  function stopProgress() {
    if (progressTimer.current) {
      window.clearInterval(progressTimer.current)
      progressTimer.current = null
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    const formData = new FormData(event.currentTarget)
    const campaignTypeValue = String(formData.get("campaignType") ?? "Airdrop")
    const chainValue = String(formData.get("chain") ?? "Ethereum")
    const projectNameValue = String(formData.get("projectName") ?? "").trim()
    const modeValue = String(formData.get("analysisMode") ?? "onchain") as AnalysisMode
    const riskPolicyValue = String(formData.get("riskPolicy") ?? "balanced") as RiskPolicy

    if (!selectedFile) {
      setError("CSV file is required.")
      return
    }
    if (!enrichableChains.has(chainValue)) {
      setError(
        `${chainValue} on-chain analysis is not available yet. Select Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, or Solana.`,
      )
      return
    }
    if (!projectNameValue) {
      formData.set("projectName", `${chainValue} ${campaignTypeValue} Wallet Audit`)
    }
    formData.set("csvFile", selectedFile)
    formData.set("analysisMode", modeValue)
    formData.set("riskPolicy", riskPolicyValue)

    const steps = enrichmentSteps
    setProgressSteps(steps)
    setProgressIndex(0)
    setPending(true)
    startProgress(steps.length)

    try {
      const response = await fetch("/api/analysis", { method: "POST", body: formData })
      const body = (await response.json().catch(() => ({}))) as CreateResponse
      if (response.status === 401) {
        stopProgress()
        router.push("/login")
        return
      }
      if (response.status === 402 || body.code === "PAYMENT_REQUIRED") {
        stopProgress()
        setPending(false)
        toast("Free trial limit reached. Continue with checkout.", "info")
        router.push(body.checkoutUrl ?? "/checkout")
        return
      }
      if (!response.ok || !body.analysisId) {
        stopProgress()
        setError(body.error ?? "Analysis could not be created")
        setPending(false)
        return
      }
      stopProgress()
      setProgressIndex(steps.length)
      ;(body.parseSummary?.warnings ?? []).forEach((warning) => toast(warning, "info"))
      toast(`Analysis queued with ${riskPolicyValue} policy`, "success")
      setNote(body.parseSummary?.note ?? "")
      router.push(`/dashboard/analysis/${body.analysisId}`)
      router.refresh()
    } catch {
      stopProgress()
      setError("Analysis could not be created. Please try again.")
      setPending(false)
    }
  }

  const defaultProjectName = `${chain} ${campaignType} Wallet Audit`
  const supportedEnrichmentChains = supportedChains.filter((supportedChain) =>
    enrichableChains.has(supportedChain),
  )
  const displayProjectName = projectName.trim() || defaultProjectName
  const modeLabel = analysisMode === "onchain" ? "On-chain enrichment" : "Hybrid"
  const walletCountLabel = preview ? preview.rowCount.toLocaleString() : "Waiting for CSV"
  const fileIsValid = Boolean(preview && preview.invalidCount === 0 && preview.rowCount > 0)

  return (
    <form onSubmit={onSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
      <Card className="glass-panel overflow-hidden border-white/[0.07]">
        <CardHeader className="border-b border-white/[0.055] bg-white/[0.012] px-5 py-5 sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg text-white">Analysis configuration</CardTitle>
              <CardDescription className="mt-1.5 max-w-2xl leading-6">
                Set campaign context, choose the evidence strategy, and upload the wallet list. You can review everything in the summary panel before starting.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-cyan-300/16 bg-cyan-300/[0.04] text-cyan-200">
              V1.8 policy engine
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 p-5 sm:p-7">
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.018] p-5 sm:p-6">
            <SectionHeading
              step="01"
              title="Campaign setup"
              description="Give the run a recognizable name and define the campaign context."
            />

            <div className="grid gap-5">
              <Field>
                <FieldLabel htmlFor="projectName">Project name</FieldLabel>
                <Input
                  id="projectName"
                  name="projectName"
                  placeholder={defaultProjectName}
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                />
                <FieldDescription>
                  Leave empty to save as <span className="text-slate-300">{defaultProjectName}</span>.
                </FieldDescription>
              </Field>

              <div className="grid gap-5 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="campaignType">Campaign type</FieldLabel>
                  <select
                    id="campaignType"
                    name="campaignType"
                    className={selectClass}
                    value={campaignType}
                    onChange={(event) => setCampaignType(event.target.value)}
                  >
                    {campaignTypes.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="chain">Chain</FieldLabel>
                  <select
                    id="chain"
                    name="chain"
                    className={selectClass}
                    value={chain}
                    onChange={(event) => {
                      setChain(event.target.value)
                      if (event.target.value !== "Solana") setDeepHistory(false)
                    }}
                  >
                    {supportedEnrichmentChains.map((supportedChain) => (
                      <option key={supportedChain} value={supportedChain}>{supportedChain}</option>
                    ))}
                  </select>
                  <FieldDescription>Only chains with real provider support are shown.</FieldDescription>
                </Field>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.018] p-5 sm:p-6">
            <SectionHeading
              step="02"
              title="Analysis configuration"
              description="Choose how evidence is enriched and how aggressively the policy engine should classify risk."
            />

            <div className="grid gap-5">
              <Field>
                <FieldLabel htmlFor="analysisMode">Analysis mode</FieldLabel>
                <select
                  id="analysisMode"
                  name="analysisMode"
                  className={selectClass}
                  value={analysisMode}
                  onChange={(event) => setAnalysisMode(event.target.value as AnalysisMode)}
                >
                  <option value="onchain">On-Chain Enrichment</option>
                  <option value="hybrid">Hybrid</option>
                </select>
                <FieldDescription>{modeDescriptions[analysisMode]}</FieldDescription>
              </Field>

              <Field>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FieldLabel>Risk policy preset</FieldLabel>
                  <span className="text-[11px] text-slate-500">Balanced is recommended for most campaigns.</span>
                </div>
                <input type="hidden" name="riskPolicy" value={riskPolicy} />
                <div className="mt-2 grid gap-3 md:grid-cols-3">
                  {(["conservative", "balanced", "strict"] as RiskPolicy[]).map((policy) => {
                    const selected = riskPolicy === policy
                    return (
                      <button
                        key={policy}
                        type="button"
                        onClick={() => setRiskPolicy(policy)}
                        aria-pressed={selected}
                        className={cn(
                          "relative rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                          selected
                            ? "border-cyan-300/28 bg-cyan-300/[0.065] shadow-[inset_0_1px_0_rgba(255,255,255,.035)]"
                            : "border-white/[0.065] bg-black/10 hover:border-cyan-300/16 hover:bg-cyan-300/[0.02]",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("text-sm font-semibold", selected ? "text-white" : "text-slate-300")}>
                            {riskPolicyLabels[policy]}
                          </span>
                          {policy === "balanced" && (
                            <Badge variant="outline" className="h-5 border-emerald-300/16 bg-emerald-300/[0.035] px-2 text-[10px] text-emerald-200">
                              Recommended
                            </Badge>
                          )}
                        </div>
                        <p className="mt-2 text-[11px] leading-5 text-slate-500">{riskPolicyDescriptions[policy]}</p>
                      </button>
                    )
                  })}
                </div>
              </Field>

              {chain === "Solana" && (
                <Field>
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.065] bg-black/10 p-4 transition hover:border-cyan-300/16">
                    <input
                      type="checkbox"
                      name="deepHistory"
                      value="true"
                      checked={deepHistory}
                      onChange={(event) => setDeepHistory(event.target.checked)}
                      className="mt-1 size-4 accent-primary"
                    />
                    <span>
                      <span className="block text-sm font-medium text-slate-200">Use deeper Solana history</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">
                        Fetch a larger signature window for stronger first-funding, timing, and activity evidence. Best for final audits; it can take longer and use more RPC capacity.
                      </span>
                    </span>
                  </label>
                </Field>
              )}

              <Alert className="border-cyan-300/12 bg-cyan-300/[0.025]">
                <ShieldCheck />
                <AlertDescription>
                  Every run uses real on-chain data. Temporary provider issues are retried and kept in Gray Zone; they never become automatic wallet-risk or eligibility decisions.
                  {!chainSupportsEnrichment && ` ${chain} is not supported yet.`}
                </AlertDescription>
              </Alert>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.018] p-5 sm:p-6">
            <SectionHeading
              step="03"
              title="Wallet data"
              description="Upload the participant list. Tri-Proof validates the structure before analysis starts."
            />

            <Field>
              <label
                onDragOver={(event) => {
                  event.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                className={cn(
                  "group relative flex min-h-56 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/[0.12] bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,.055),transparent_48%),rgba(0,0,0,.12)] px-6 py-9 text-center transition",
                  "hover:border-cyan-300/30 hover:bg-cyan-300/[0.025]",
                  isDragging && "border-cyan-300/45 bg-cyan-300/[0.05] shadow-[0_0_40px_rgba(34,211,238,.06)]",
                  selectedFile && "border-emerald-300/22",
                )}
              >
                <span className={cn(
                  "mb-4 flex size-14 items-center justify-center rounded-2xl border transition",
                  selectedFile
                    ? "border-emerald-300/18 bg-emerald-300/[0.05]"
                    : "border-cyan-300/16 bg-cyan-300/[0.045] group-hover:border-cyan-300/24",
                )}>
                  {selectedFile ? (
                    <FileCheck2 className="size-6 text-emerald-300" />
                  ) : (
                    <UploadCloud className="size-6 text-cyan-300" />
                  )}
                </span>
                <span className="text-sm font-semibold text-white">
                  {selectedFile ? selectedFile.name : "Drag and drop your CSV"}
                </span>
                <span className="mt-1 text-xs text-slate-500">
                  {selectedFile ? "Click or drop another file to replace it" : "or click anywhere in this area to browse files"}
                </span>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500">
                  <span className="rounded-full border border-white/[0.07] bg-black/10 px-2.5 py-1">Required: wallet_address</span>
                  <span className="rounded-full border border-white/[0.07] bg-black/10 px-2.5 py-1">CSV only</span>
                  <span className="rounded-full border border-white/[0.07] bg-black/10 px-2.5 py-1">Optional campaign metadata supported</span>
                </div>
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChange} />
              </label>
            </Field>

            {preview && (
              <div className="mt-4 rounded-2xl border border-white/[0.065] bg-black/10 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/14 bg-cyan-300/[0.04]">
                      <FileText className="size-4 text-cyan-300" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-200">{preview.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{preview.size} · {preview.mode === "enriched" ? "Enriched campaign data detected" : "Basic wallet list"}</p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      fileIsValid
                        ? "border-emerald-300/18 bg-emerald-300/[0.04] text-emerald-200"
                        : "border-amber-300/18 bg-amber-300/[0.04] text-amber-200",
                    )}
                  >
                    {fileIsValid ? <CheckCircle2 className="mr-1 size-3" /> : <Info className="mr-1 size-3" />}
                    {fileIsValid ? "Structure valid" : "Review required"}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/[0.055] bg-white/[0.018] p-3">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-slate-600">Wallet rows</p>
                    <p className="mt-1 text-lg font-semibold text-white">{preview.rowCount.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.055] bg-white/[0.018] p-3">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-slate-600">Columns</p>
                    <p className="mt-1 text-lg font-semibold text-white">{preview.columns.length}</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.055] bg-white/[0.018] p-3">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-slate-600">Invalid</p>
                    <p className={cn("mt-1 text-lg font-semibold", preview.invalidCount > 0 ? "text-amber-300" : "text-emerald-300")}>{preview.invalidCount.toLocaleString()}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {preview.columns.slice(0, 10).map((column) => (
                    <span key={column} className="rounded-full border border-white/[0.065] bg-black/10 px-2.5 py-1 text-[10px] text-slate-400">
                      {column}
                    </span>
                  ))}
                  {preview.columns.length > 10 && (
                    <span className="rounded-full border border-white/[0.065] bg-black/10 px-2.5 py-1 text-[10px] text-slate-500">
                      +{preview.columns.length - 10} more
                    </span>
                  )}
                </div>

                {preview.invalidCount > 0 && (
                  <Alert variant="destructive" className="mt-4">
                    <X />
                    <AlertDescription>
                      {preview.invalidCount.toLocaleString()} rows may be invalid or the required wallet column is missing.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={downloadSampleCsv}>
                <Download data-icon="inline-start" /> Download sample CSV
              </Button>
              <Button type="button" variant="ghost" onClick={() => router.push("/docs")}>
                <BookOpen data-icon="inline-start" /> CSV documentation
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.018] p-5 sm:p-6">
            <SectionHeading
              step="04"
              title="Optional notes"
              description="Add context for reviewers, suspicious patterns, or addresses that deserve attention."
            />
            <Field>
              <FieldLabel htmlFor="notes">Notes</FieldLabel>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Campaign context, suspicious patterns, or addresses to pay attention to."
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="min-h-28"
              />
            </Field>
          </section>

          {progressSteps.length > 0 && (
            <Card className="border-cyan-300/10 bg-cyan-300/[0.018]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {pending ? <Loader className="size-4 animate-spin" /> : <CheckCircle2 className="size-4 text-emerald-400" />}
                  Analysis progress
                </CardTitle>
                <CardDescription>Large uploads are processed in background batches.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {progressSteps.map((step, index) => (
                  <div key={step} className="flex items-center gap-3 text-sm">
                    {index < progressIndex ? (
                      <CheckCircle2 className="size-4 text-emerald-400" />
                    ) : index === progressIndex && pending ? (
                      <Loader2 className="size-4 animate-spin text-primary" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground" />
                    )}
                    <span>{step}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {error && (
            <Alert variant="destructive">
              <X />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-3 rounded-2xl border border-cyan-300/12 bg-[linear-gradient(110deg,rgba(34,211,238,.035),rgba(139,92,246,.025))] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Ready to launch?</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Review the run summary, then start the evidence enrichment. No final eligibility action is applied on this screen.
              </p>
            </div>
            <Button type="submit" size="lg" disabled={pending || !selectedFile} className="shrink-0">
              {pending ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <DatabaseZap data-icon="inline-start" />
              )}
              {pending ? "Starting analysis…" : "Start analysis"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <aside className="grid gap-4 xl:sticky xl:top-24">
        <Card className="glass-panel overflow-hidden border-cyan-300/10">
          <CardHeader className="border-b border-white/[0.055] bg-cyan-300/[0.018]">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl border border-cyan-300/14 bg-cyan-300/[0.045]">
                <Layers3 className="size-4 text-cyan-300" />
              </span>
              <div>
                <CardTitle className="text-base">Run summary</CardTitle>
                <CardDescription>Your current configuration</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-1 p-4">
            {[
              ["Project", displayProjectName],
              ["Campaign", campaignType],
              ["Chain", chain],
              ["Mode", modeLabel],
              ["Policy", riskPolicyLabels[riskPolicy]],
              ["Wallets", walletCountLabel],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 rounded-xl px-3 py-2.5 hover:bg-white/[0.018]">
                <span className="text-xs text-slate-500">{label}</span>
                <span className="max-w-[190px] text-right text-xs font-medium text-slate-200">{value}</span>
              </div>
            ))}
            {chain === "Solana" && deepHistory && (
              <div className="mt-2 rounded-xl border border-violet-300/12 bg-violet-300/[0.025] px-3 py-2.5 text-xs text-violet-200">
                Deeper Solana history enabled
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel border-white/[0.065]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-cyan-300" /> What happens next
            </CardTitle>
            <CardDescription>Tri-Proof keeps the workflow explainable.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              ["1", "Validate the dataset", "Check the wallet column, row structure, and optional campaign metadata."],
              ["2", "Enrich on-chain evidence", "Fetch wallet activity, funding, timing, interaction, and graph context."],
              ["3", "Prepare decisions", "Separate clear participants, gray-zone cases, and policy-triggered exclusions for review."],
            ].map(([step, title, description]) => (
              <div key={step} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-cyan-300/12 bg-cyan-300/[0.035] font-mono text-[10px] text-cyan-200">{step}</span>
                <div>
                  <p className="text-xs font-semibold text-slate-200">{title}</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">{description}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-panel border-white/[0.065]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BadgeCheck className="size-4 text-emerald-300" /> Best practices
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-slate-400">
            {[
              "Keep one wallet per row.",
              "Add referral or event timestamps when available.",
              "Use one-way hashes only for participant fingerprints.",
              "Review gray-zone cases before final eligibility export.",
            ].map((item) => (
              <div key={item} className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-300/80" />
                <span className="leading-5">{item}</span>
              </div>
            ))}
            <div className="grid gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={downloadSampleCsv}>
                <Download data-icon="inline-start" /> Sample CSV
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/docs")}>
                <BookOpen data-icon="inline-start" /> Open documentation
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="rounded-2xl border border-violet-300/10 bg-violet-300/[0.02] p-4 text-[11px] leading-5 text-slate-500">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 size-3.5 shrink-0 text-violet-300/80" />
            <p>Analysis creates recommendations and evidence for review. It does not automatically distribute rewards or execute wallet actions.</p>
          </div>
        </div>
      </aside>
    </form>
  )
}
