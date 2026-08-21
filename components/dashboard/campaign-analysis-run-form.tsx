"use client"

import { ChangeEvent, FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { FileUp, Loader2, PlayCircle, ShieldAlert } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { useToast } from "@/components/ui/toast"

type CampaignAnalysisRunFormProps = {
  campaignId: string
  chain: string
  riskPolicy: string
  lifecycle: string
}

type RunResponse = {
  analysisId?: string
  error?: string
  code?: string
  checkoutUrl?: string
  issues?: string[]
  duplicates?: string[]
}

const selectClass =
  "h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

function fileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function CampaignAnalysisRunForm({
  campaignId,
  chain,
  riskPolicy,
  lifecycle,
}: CampaignAnalysisRunFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [analysisMode, setAnalysisMode] = useState<"onchain" | "hybrid">("onchain")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  const canRun = lifecycle === "draft" || lifecycle === "active"

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setError("")
    if (file && !file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      setSelectedFile(null)
      setError("Please select a CSV file.")
      return
    }
    setSelectedFile(file)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    if (!canRun) {
      setError(`Campaign lifecycle ${lifecycle} does not accept new analysis runs.`)
      return
    }
    if (!selectedFile) {
      setError("Wallet CSV is required.")
      return
    }

    const formData = new FormData()
    formData.set("csvFile", selectedFile)
    formData.set("analysisMode", analysisMode)
    formData.set("riskPolicy", riskPolicy)
    setPending(true)

    try {
      const response = await fetch(`/api/v2/campaigns/${campaignId}/analyses`, {
        method: "POST",
        body: formData,
      })
      const result = (await response.json().catch(() => ({}))) as RunResponse
      if (response.status === 401) {
        router.push("/login")
        return
      }
      if (response.status === 402 && result.checkoutUrl) {
        toast("Analysis capacity reached. Continue with checkout.", "info")
        router.push(result.checkoutUrl)
        return
      }
      if (!response.ok || !result.analysisId) {
        setError(result.error ?? "Analysis run could not be created")
        return
      }

      for (const issue of (result.issues ?? []).slice(0, 3)) toast(issue, "info")
      if ((result.duplicates?.length ?? 0) > 0) {
        toast(`${result.duplicates!.length} duplicate CSV row(s) were ignored.`, "info")
      }
      toast(`Campaign analysis queued with ${riskPolicy} policy.`, "success")
      router.push(`/dashboard/analysis/${result.analysisId}`)
      router.refresh()
    } catch {
      setError("Analysis run could not be created. Please try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="glass-panel premium-card border-cyan-400/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><PlayCircle className="size-5 text-cyan-300" /> Run campaign analysis</CardTitle>
        <CardDescription>
          Add a new wallet cohort to this existing campaign. Previous runs, reviews, and decision packages remain unchanged.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!canRun ? (
          <Alert>
            <ShieldAlert />
            <AlertDescription>
              This campaign is {lifecycle}. Resume or reactivate it before starting another wallet analysis.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-border bg-background/45 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Campaign chain</p>
                <p className="mt-1 font-medium">{chain}</p>
              </div>
              <div className="rounded-xl border border-border bg-background/45 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Policy</p>
                <p className="mt-1 font-medium capitalize">{riskPolicy}</p>
              </div>
              <div className="rounded-xl border border-border bg-background/45 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Lifecycle</p>
                <p className="mt-1 font-medium capitalize">{lifecycle}</p>
              </div>
            </div>

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`analysisMode-${campaignId}`}>Analysis mode</FieldLabel>
                <select
                  id={`analysisMode-${campaignId}`}
                  className={selectClass}
                  value={analysisMode}
                  onChange={(event) => setAnalysisMode(event.target.value as "onchain" | "hybrid")}
                >
                  <option value="onchain">On-chain enrichment</option>
                  <option value="hybrid">Hybrid CSV + on-chain</option>
                </select>
                <FieldDescription>Both modes use real provider data; mock wallet history is not accepted.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor={`csvFile-${campaignId}`}>Wallet CSV</FieldLabel>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-background/45 p-4 transition hover:border-cyan-400/35 hover:bg-cyan-400/[0.03]">
                  <FileUp className="size-6 shrink-0 text-cyan-300" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{selectedFile ? selectedFile.name : "Select campaign wallet CSV"}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {selectedFile ? fileSize(selectedFile.size) : "Required address column: wallet_address, address, or wallet"}
                    </span>
                  </span>
                  <input id={`csvFile-${campaignId}`} type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChange} />
                </label>
                <FieldDescription>
                  The server uses the same canonical CSV parser as the existing analysis pipeline, including campaign event and referral columns.
                </FieldDescription>
              </Field>
            </FieldGroup>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={pending || !selectedFile} className="w-fit">
              {pending ? <Loader2 className="animate-spin" /> : <PlayCircle />}
              {pending ? "Queueing analysis…" : "Start analysis run"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
