"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react"

import { AnalysisDetail } from "@/components/analysis/analysis-detail"
import { AnalysisProcessing, type AnalysisProcessingStatus } from "@/components/analysis/analysis-processing"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type RouteState =
  | { status: "loading" }
  | { status: "processing"; data: Partial<AnalysisProcessingStatus> }
  | { status: "completed" }
  | { status: "error"; message: string }

const dashboardTextReplacements = new Map<string, string>([
  ["Manual Review", "Gray Zone"],
  ["manual review", "Gray Zone"],
  ["Mark Manual Review", "Mark Gray Zone"],
  ["Export Manual Review CSV", "Export Gray-Zone CSV"],
  ["Rejected", "Rejected / Not Eligible"],
  ["rejected", "Rejected / Not Eligible"],
  ["Mark Rejected", "Mark Rejected / Not Eligible"],
  ["Export Rejected CSV", "Export Rejected / Not Eligible CSV"],
  ["Failed enrichments", "No On-chain Data"],
  ["Fell back to available data.", "No reliable on-chain history found."],
  ["Needs project team decision.", "Needs project-side review."],
  ["High risk reward exclusions.", "High-risk or not-eligible reward exclusions."],
])

function normalizeTextNode(node: Text) {
  const current = node.nodeValue ?? ""
  const trimmed = current.trim()
  const replacement = dashboardTextReplacements.get(trimmed)
  if (!replacement || current.includes(replacement)) return
  node.nodeValue = current.replace(trimmed, replacement)
}

function normalizeDashboardLabels(root: ParentNode = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text)
  }
  textNodes.forEach(normalizeTextNode)
}

function DashboardLabelNormalizer() {
  useEffect(() => {
    normalizeDashboardLabels()
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            normalizeTextNode(node as Text)
            return
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            normalizeDashboardLabels(node as Element)
          }
        })
      })
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    return () => observer.disconnect()
  }, [])

  return null
}

export function AnalysisRouteClient({ analysisId }: { analysisId: string }) {
  const [state, setState] = useState<RouteState>({ status: "loading" })

  async function load() {
    setState({ status: "loading" })
    try {
      const response = await fetch(`/api/analysis/${analysisId}/status`, { cache: "no-store" })
      const body = (await response.json().catch(() => ({}))) as Partial<AnalysisProcessingStatus> & { error?: string }

      if (!response.ok) {
        throw new Error(body.error ?? "Analysis status could not be loaded")
      }

      if (body.status === "completed" || body.status === "failed") {
        setState({ status: "completed" })
        return
      }

      setState({ status: "processing", data: body })
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Analysis could not be loaded",
      })
    }
  }

  useEffect(() => {
    void load()
  }, [analysisId])

  if (state.status === "loading") {
    return (
      <main className="premium-page min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
        <DashboardLabelNormalizer />
        <Card className="glass-panel mx-auto max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="size-5 animate-spin text-primary" /> Loading analysis
            </CardTitle>
            <CardDescription>Checking analysis status without server-side database rendering.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  if (state.status === "processing") {
    return (
      <main className="premium-page min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
        <DashboardLabelNormalizer />
        <AnalysisProcessing analysisId={analysisId} initialStatus={state.data} />
      </main>
    )
  }

  if (state.status === "completed") {
    return (
      <main className="premium-page min-h-screen bg-background text-foreground">
        <DashboardLabelNormalizer />
        <AnalysisDetail analysisId={analysisId} />
      </main>
    )
  }

  return (
    <main className="premium-page min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
      <DashboardLabelNormalizer />
      <Card className="glass-panel mx-auto max-w-2xl border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" /> Analysis could not load
          </CardTitle>
          <CardDescription>
            The page did not crash. The backend status endpoint returned the error below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {state.message}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void load()}>
              <RotateCcw data-icon="inline-start" /> Retry
            </Button>
            <Link href="/dashboard/new-analysis" className={buttonVariants({ variant: "outline" })}>
              New analysis
            </Link>
            <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
              Dashboard
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
