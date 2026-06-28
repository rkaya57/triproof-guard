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
  error?: string
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

const enrichedColumns = new Set([
  "funding_source",
  "tx_count",
  "wallet_age_days",
  "contract_interactions",
  "campaign_actions",
  "risk_flags",
])

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
      : dataRows.filter((row) => {
          const value = splitCsvRow(row)[walletColumnIndex] ?? ""
          return !/^0x[a-fA-F0-9]{40}$/.test(value)
        }).length
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

const sampleCsv = `wallet_address
0x1111111111111111111111111111111111111111
0x2222222222222222222222222222222222222222
0x3333333333333333333333333333333333333333
0x4444444444444444444444444444444444444444
0x5555555555555555555555555555555555555555
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

const baseSteps = ["Parsing CSV", "Running risk engine", "Generating report"]
const enrichmentSteps = [
  "Parsing CSV",
  "Enriching wallets",
  "Running risk engine",
  "Generating report",
]

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
  const [analysisMode, setAnalysisMode] = useState<"csv_only" | "onchain" | "hybrid">(
    "csv_only"
  )

  const enrichableChains = new Set([
    "Ethereum",
    "Base",
    "Arbitrum",
    "Optimism",
    "Polygon",
    "BNB Chain",
  ])
  const wantsEnrichment = analysisMode === "onchain" || analysisMode === "hybrid"
  const chainSupportsEnrichment = enrichableChains.has(chain)

  const modeDescriptions: Record<typeof analysisMode, string> = {
    csv_only: "Use only the fields provided in the uploaded CSV.",
    onchain:
      "Fetch wallet activity, age, funding source and interaction data from blockchain APIs.",
    hybrid: "Use uploaded CSV fields first and enrich missing data from blockchain APIs.",
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
      // advance up to the last step, which stays active until completion
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
    const modeValue = String(formData.get("analysisMode") ?? "csv_only")

    if (!selectedFile) {
      setError("CSV file is required.")
      return
    }

    if (!projectName) {
      formData.set("projectName", `${chainValue} ${campaignTypeValue} Wallet Audit`)
    }
    formData.set("csvFile", selectedFile)

    const steps =
      modeValue === "onchain" || modeValue === "hybrid" ? enrichmentSteps : baseSteps
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

      if (!response.ok || !body.analysisId) {
        stopProgress()
        setError(body.error ?? "Analysis could not be created")
        setPending(false)
        return
      }

      stopProgress()
      setProgressIndex(steps.length)
      ;(body.parseSummary?.warnings ?? []).forEach((warning) => toast(warning, "info"))
      toast("Analysis complete", "success")
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

  return (
    <div className="mx-auto max-w-4xl">
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>New Analysis</CardTitle>
          <CardDescription>
            Upload a basic or enriched wallet CSV. Basic CSVs run in limited analysis mode with deterministic heuristics.
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
                    {supportedChains.map((supportedChain) => (
                      <option key={supportedChain} value={supportedChain}>
                        {supportedChain}
                        {supportedChain === "Solana" ? " (on-chain coming soon)" : ""}
                      </option>
                    ))}
                  </select>
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
                    setAnalysisMode(event.target.value as typeof analysisMode)
                  }
                >
                  <option value="csv_only">CSV Only</option>
                  <option value="onchain">On-Chain Enrichment</option>
                  <option value="hybrid">Hybrid</option>
                </select>
                <FieldDescription>{modeDescriptions[analysisMode]}</FieldDescription>
              </Field>

              {wantsEnrichment && (
                <Alert>
                  <FileUp />
                  <AlertDescription>
                    On-chain enrichment may take longer depending on wallet count,
                    selected chain and API rate limits.
                    {!chainSupportsEnrichment && (
                      <>
                        {" "}
                        On-chain enrichment is not available for {chain} yet — the
                        analysis will run in CSV Only mode.
                      </>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {wantsEnrichment && (
                <Field>
                  <FieldLabel htmlFor="campaignContracts">
                    Campaign contract addresses (optional)
                  </FieldLabel>
                  <Textarea
                    id="campaignContracts"
                    name="campaignContracts"
                    placeholder={"0xabc...\n0xdef...\n0xghi..."}
                    rows={4}
                  />
                  <FieldDescription>
                    One address per line. Used to count campaign interactions per
                    wallet. Leave empty to skip campaign-action detection.
                  </FieldDescription>
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="csvFile">Upload CSV</FieldLabel>
                <label
                  htmlFor="csvFile"
                  onDragOver={(event) => {
                    event.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background/50 px-5 py-8 text-center transition hover:border-primary/50 hover:bg-primary/5",
                    isDragging && "border-primary bg-primary/10",
                  )}
                >
                  <UploadCloud className="mb-3 size-9 text-primary" />
                  <span className="font-medium">Drop CSV here or browse files</span>
                  <span className="mt-1 text-sm text-muted-foreground">
                    Basic CSVs are supported; enriched columns improve cluster and funding analysis.
                  </span>
                  <Input
                    id="csvFile"
                    name="csvFile"
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={onFileChange}
                  />
                </label>
                <FieldDescription className="flex flex-wrap items-center gap-2">
                  Required column: wallet_address. Enriched columns improve risk analysis.
                  <button
                    type="button"
                    onClick={downloadSampleCsv}
                    className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                  >
                    <Download className="size-3.5" aria-hidden />
                    Download sample CSV
                  </button>
                </FieldDescription>
              </Field>

              {preview && (
                <div className="rounded-lg border border-border bg-background/50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex gap-3">
                      <span className="flex size-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                        <FileText className="size-5" />
                      </span>
                      <div>
                        <p className="font-medium">{preview.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {preview.size} • {preview.rowCount} rows • {preview.mode} mode
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedFile(null)
                        setPreview(null)
                      }}
                      aria-label="Remove file"
                    >
                      <X />
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-card/70 p-3">
                      <p className="text-xs text-muted-foreground">Detected columns</p>
                      <p className="mt-1 truncate text-sm font-medium">
                        {preview.columns.slice(0, 5).join(", ") || "None"}
                        {preview.columns.length > 5 ? ` +${preview.columns.length - 5}` : ""}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-card/70 p-3">
                      <p className="text-xs text-muted-foreground">Invalid preview rows</p>
                      <p className="mt-1 text-sm font-medium">{preview.invalidCount}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-card/70 p-3">
                      <p className="text-xs text-muted-foreground">Default project</p>
                      <p className="mt-1 truncate text-sm font-medium">{defaultProjectName}</p>
                    </div>
                  </div>
                </div>
              )}

              <Field>
                <FieldLabel htmlFor="notes">Notes</FieldLabel>
                <Textarea
                  id="notes"
                  name="notes"
                  placeholder="Internal campaign context, allowlist caveats, or reward rules."
                  rows={5}
                />
              </Field>
            </FieldGroup>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {note && (
              <Alert>
                <FileUp />
                <AlertDescription>{note}</AlertDescription>
              </Alert>
            )}

            {pending && progressSteps.length > 0 && (
              <div className="animate-in fade-in slide-in-from-bottom-2 rounded-lg border border-primary/25 bg-primary/5 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Running analysis…</p>
                  <span className="font-mono text-xs text-primary">
                    {Math.min(
                      Math.round((progressIndex / progressSteps.length) * 100),
                      100
                    )}
                    %
                  </span>
                </div>
                <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                    style={{
                      width: `${Math.min(
                        Math.round(((progressIndex + 0.5) / progressSteps.length) * 100),
                        100
                      )}%`,
                    }}
                  />
                </div>
                <ol className="flex flex-col gap-2.5">
                  {progressSteps.map((step, index) => {
                    const done = index < progressIndex
                    const active = index === progressIndex
                    return (
                      <li key={step} className="flex items-center gap-3 text-sm">
                        {done ? (
                          <CheckCircle2 className="size-4 text-green-300" aria-hidden />
                        ) : active ? (
                          <Loader className="size-4 animate-spin text-primary" aria-hidden />
                        ) : (
                          <Circle className="size-4 text-muted-foreground/40" aria-hidden />
                        )}
                        <span
                          className={cn(
                            "transition-colors",
                            done
                              ? "text-muted-foreground line-through decoration-muted-foreground/40"
                              : active
                                ? "font-medium text-foreground"
                                : "text-muted-foreground"
                          )}
                        >
                          {step}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                Invalid and duplicate wallet rows are skipped and reported by the parser.
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <FileUp data-icon="inline-start" />
                )}
                Run Analysis
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
