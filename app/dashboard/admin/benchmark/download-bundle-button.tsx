"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"

type ReviewBundleResponse = {
  batchId: string
  reviewerCsv: string
  reviewerFileName: string
  privateSealFileName: string
  privateSealGzipBase64: string
  summary: {
    representativeCases: number
    contextRows: number
    projects: number
    byChain: Record<string, number>
    plannedSplits: Record<string, number>
    reviewerSha256: string
    auditSha256: string
  }
}

function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export function DownloadReviewBundleButton() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleDownload() {
    setLoading(true)
    setMessage(null)
    try {
      const response = await fetch(
        "/api/admin/benchmark/reviewer-bundle?perProject=20",
        { cache: "no-store" }
      )
      const payload = (await response.json()) as ReviewBundleResponse | { error?: string }
      if (!response.ok || !("reviewerCsv" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Bundle export failed")
      }

      downloadBlob(
        payload.reviewerFileName,
        new Blob([`\uFEFF${payload.reviewerCsv}`], {
          type: "text/csv;charset=utf-8",
        })
      )
      downloadBlob(
        payload.privateSealFileName,
        new Blob([base64ToBytes(payload.privateSealGzipBase64)], {
          type: "application/gzip",
        })
      )

      setMessage(
        `Batch ${payload.batchId}: reviewer CSV + PRIVATE seal downloaded. Send only the CSV to reviewers.`
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bundle export failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" className="glow-primary" onClick={handleDownload} disabled={loading}>
        {loading ? (
          <Loader2 data-icon="inline-start" className="animate-spin" />
        ) : (
          <Download data-icon="inline-start" />
        )}
        {loading ? "Freezing batch..." : "Freeze & download review batch"}
      </Button>
      {message ? <p className="max-w-xl text-xs text-slate-400">{message}</p> : null}
    </div>
  )
}
