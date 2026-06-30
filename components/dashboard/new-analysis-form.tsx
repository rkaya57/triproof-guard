"use client"

import { ChangeEvent, DragEvent, FormEvent, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  Circle,
  Download,
  FileText,
  FileUp,
  Loader2,
  Loader,
  UploadCloud,
  X,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toast"
import { campaignTypes, supportedChains } from "@/lib/validators/wallet"

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
  }
}

const selectClass =
  "h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

type CsvPreview = {
  name: string
  size: string
  rowCount: number
  columns: string[]
  mode: "basic" | "enriched"
  invalidCount: number
}

type AnalysisMode = "onchain" | "hybrid"

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
  "Running risk engine",
  "Generating report",
]

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
  const invalidCount =
    walletColumnIndex < 0
      ? dataRows.length
      : 0
  const mode = normalizedColumns.some((column) => enrichedColumns.has(column)) ? "enriched" : "basic"

  return {
    name: file.name,
    size: formatFileSize(file.size),
    rowCount: dataRows.length,
    columns,
    mode,
    invalidCount,
  }
}

const sampleCsv = `wallet_address,policy_action,reputation_label,policy_reason
4V1C76x5SpQhYpZ3EnfHWxyaFmQy6GzwR8NhBpaALsPR,,,
7Zb1bJ6Qn3z2XxgR7K4pGv6fW8cY5mT9nL2sA3dE4fG,manual_review,needs_review,Project team wants a human check
9xQeWvG816bUx9EPfvhkgqJQ3Z9H6uZq1JtV7mYz3Kk,reject,known_sybil,Imported from customer blocklist
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

export function NewAnalysisForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, setPending] = useState(false)
  const [progressSteps, setProgressSteps] = useState<string[]>([])
  const [progressIndex, setProgressIndex] = useState(0)
  const progressTimer = useRef<number | null>(null)
  const [error, setError] = useState("")
  const [note, setNote] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<CsvPreview | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [campaignType, setCampaignType] = useState("Airdrop")
  const [chain, setChain] = useState("Ethereum")
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("onchain")

  const chainSupportsEnrichment = enrichableChains.has(chain)

  const modeDescriptions: Record<AnalysisMode, string> = {
    onchain:
      "Fetch real wallet activity, age, funding source and interaction data from blockchain APIs. No synthetic CSV-only scoring is used.",
    hybrid:
      "Use uploaded CSV fields first and enrich missing data from blockchain APIs. No mock wallet history is generated.",
  }

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

  useEffect(() => {
    return () => {
      if (progressTimer.current) window.clearInterval(progressTimer.current)
    }
  }, [])

  function startProgress(stepCount: number) {
    if (progressTimer.current) window.clearInterval(progressTimer.current)
    progressTimer.current = window.setInterval(() => {
      setProgressIndex((current) => Math.min(current + 1, stepCount - 1))
    }, 850)
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
    setNote("")

    const formData = new FormData(event.currentTarget)
    const campaignTypeValue = String(formData.get("campaignType") ?? "Airdrop")
    const chainValue = String(formData.get("chain") ?? "Ethereum")
    const projectName = String(formData.get("projectName") ?? "").trim()
    const modeValue = String(formData.get("analysisMode") ?? "onchain") as AnalysisMode

    if (!selectedFile) {
      setError("CSV file is required.")
      return
    }

    if (!enrichableChains.has(chainValue)) {
      setError(`${chainValue} on-chain analysis is not available yet. Select Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, or Solana.`)
      return
    }

    if (!projectName) {
      formData.set("projectName", `${chainValue} ${campaignTypeValue} Wallet Audit`)
    }
    formData.set("csvFile", selectedFile)
    formData.set("analysisMode", modeValue)

    const steps = enrichmentSteps
    setProgressSteps(steps)
    setProgressIndex(0)
    setPending(true)
    startProgress(steps.length)

    try {
      const response = await fetch("/api/analysis", {
        method: "POST",
        body: formData,
      })
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
      toast("Analysis queued", "success")
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
    enrichableChains.has(supportedChain)
  )

  return (
    <div className="mx-auto max-w-4xl">
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>New Analysis</CardTitle>
          <CardDescription>
            Upload a wallet CSV and run real on-chain enrichment. CSV-only/basic mode has been removed to avoid synthetic or misleading results.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-6">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="projectName">Project name</FieldLabel>
                <Input
                  id="projectName"
                  name="projectName"
                  placeholder={defaultProjectName}
                />
                <FieldDescription>
                  Empty project names are saved as {defaultProjectName}.
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
                      <option key={type} value={type}>
                        {type}
                      </option>
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
                    onChange={(event) => setChain(event.target.value)}
                  >
                    {supportedEnrichmentChains.map((supportedChain) => (
                      <option key={supportedChain} value={supportedChain}>
                        {supportedChain}
                      </option>
                    ))}
                  </select>
                  <FieldDescription>
                    EVM chains and Solana with real on-chain provider support are shown.
                  </FieldDescription>
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="analysisMode">Analysis mode</FieldLabel>
                <select
                  id="analysisMode"
                  name="analysisMode"
                  className={selectClass}
                  value={analysisMode}
                  onChange={(event) =>
                    setAnalysisMode(event.target.value as AnalysisMode)
                  }
                >
                  <option value="onchain">On-Chain Enrichment</option>
                  <option value="hybrid">Hybrid</option>
                </select>
                <FieldDescription>{modeDescriptions[analysisMode]}</FieldDescription>
              </Field>

              <Alert>
                <FileUp />
                <AlertDescription>
                  Every new analysis now uses real on-chain data. If the selected provider cannot return data, the report will show missing/failed enrichment instead of fabricated wallet history.
                  {!chainSupportsEnrichment && ` ${chain} is not supported yet.`}
                </AlertDescription>
              </Alert>

              <Field>
                <FieldLabel>Wallet CSV</FieldLabel>
                <label
                  onDragOver={(event) => {
                    event.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/50 p-8 text-center transition hover:border-primary/60 hover:bg-primary/5",
                    isDragging && "border-primary bg-primary/5",
                  )}
                >
                  <UploadCloud className="mb-3 size-8 text-primary" />
                  <span className="font-medium">Drop your CSV here or click to upload</span>
                  <span className="mt-1 text-sm text-muted-foreground">
                    Required column: wallet_address, address, or wallet
                  </span>
                  <span className="mt-1 max-w-xl text-xs text-muted-foreground">
                    Optional V1.4 columns: policy_action, reputation_label, policy_reason, entity_label, entity_type. Use allowlist/trusted_user, blocklist/known_sybil, or needs_review to import project-side reputation decisions.
                  </span>
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChange} />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={downloadSampleCsv}>
                    <Download data-icon="inline-start" /> Download sample CSV
                  </Button>
                </div>
              </Field>

              {preview && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="size-4" /> CSV preview
                    </CardTitle>
                    <CardDescription>
                      {preview.name} · {preview.size} · {preview.rowCount.toLocaleString()} rows · {preview.mode} mode
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex flex-wrap gap-2">
                      {preview.columns.map((column) => (
                        <span key={column} className="rounded-full border border-border px-2 py-1 text-xs">
                          {column}
                        </span>
                      ))}
                    </div>
                    {preview.invalidCount > 0 && (
                      <Alert variant="destructive">
                        <X />
                        <AlertDescription>
                          {preview.invalidCount.toLocaleString()} rows may be invalid or missing a wallet column.
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              )}

              <Field>
                <FieldLabel htmlFor="notes">Notes</FieldLabel>
                <Textarea
                  id="notes"
                  name="notes"
                  placeholder="Campaign context, suspicious patterns, or addresses to pay attention to."
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </Field>

              {progressSteps.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      {pending ? <Loader className="size-4 animate-spin" /> : <CheckCircle2 className="size-4 text-green-500" />}
                      Analysis progress
                    </CardTitle>
                    <CardDescription>
                      Large uploads are processed in background batches.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {progressSteps.map((step, index) => (
                      <div key={step} className="flex items-center gap-3 text-sm">
                        {index < progressIndex ? (
                          <CheckCircle2 className="size-4 text-green-500" />
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

              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <FileUp data-icon="inline-start" />}
                Run On-Chain Analysis
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
