"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  FilePlus2,
  FileText,
  Search,
  ShieldCheck,
  ShieldQuestion,
  Users,
  XCircle,
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
import { Input } from "@/components/ui/input"
import { formatDateTimeUTC, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

export type CampaignWorkspaceAnalysis = {
  id: string
  status: string
  totalWallets: number
  approvedCount: number
  manualReviewCount: number
  rejectedCount: number
  averageRiskScore: number
  suspiciousClustersCount: number
  createdAt: string
  completedAt: string | null
}

export type CampaignWorkspaceProject = {
  id: string
  name: string
  campaignType: string
  chain: string
  createdAt: string
  updatedAt: string
  analysisCount: number
  analyses: CampaignWorkspaceAnalysis[]
}

type CampaignsWorkspaceProps = {
  projects: CampaignWorkspaceProject[]
  loadError?: boolean
}

type LifecycleFilter =
  | "all"
  | "in_progress"
  | "needs_review"
  | "completed"
  | "no_analysis"

const processingStatuses = new Set([
  "pending",
  "processing",
  "enriching",
  "analyzing",
])

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function projectLifecycle(
  project: CampaignWorkspaceProject
): Exclude<LifecycleFilter, "all"> {
  const latest = project.analyses[0]
  if (!latest) return "no_analysis"
  if (processingStatuses.has(latest.status)) return "in_progress"
  if (latest.manualReviewCount > 0) return "needs_review"
  return "completed"
}

function lifecycleLabel(lifecycle: Exclude<LifecycleFilter, "all">) {
  if (lifecycle === "in_progress") return "In progress"
  if (lifecycle === "needs_review") return "Needs review"
  if (lifecycle === "completed") return "Completed"
  return "No analysis"
}

function lifecycleClass(lifecycle: Exclude<LifecycleFilter, "all">) {
  if (lifecycle === "completed") {
    return "border-green-400/35 bg-green-400/10 text-green-200"
  }
  if (lifecycle === "needs_review") {
    return "border-amber-400/35 bg-amber-400/10 text-amber-200"
  }
  if (lifecycle === "in_progress") {
    return "border-primary/35 bg-primary/10 text-primary"
  }
  return "border-muted-foreground/30 bg-muted/40 text-muted-foreground"
}

function analysisStatusClass(status: string) {
  if (status === "completed") {
    return "border-green-400/30 bg-green-400/10 text-green-200"
  }
  if (status === "failed") {
    return "border-red-400/30 bg-red-400/10 text-red-200"
  }
  return "border-primary/30 bg-primary/10 text-primary"
}

function CampaignCard({ project }: { project: CampaignWorkspaceProject }) {
  const latest = project.analyses[0]
  const lifecycle = projectLifecycle(project)

  return (
    <Card className="glass-panel premium-card overflow-hidden">
      <CardHeader className="gap-4 border-b border-border/70 bg-background/30 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="break-words text-xl">{project.name}</CardTitle>
            <Badge variant="outline" className={lifecycleClass(lifecycle)}>
              {lifecycleLabel(lifecycle)}
            </Badge>
          </div>
          <CardDescription className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{project.campaignType}</span>
            <span aria-hidden>·</span>
            <span>{project.chain}</span>
            <span aria-hidden>·</span>
            <span>{formatNumber(project.analysisCount)} analyses</span>
            <span aria-hidden>·</span>
            <span>Updated {formatDateTimeUTC(project.updatedAt)}</span>
          </CardDescription>
        </div>

        <div className="flex flex-wrap gap-2">
          {latest ? (
            <>
              <Link
                href={`/dashboard/analysis/${latest.id}`}
                className={buttonVariants({ size: "sm" })}
              >
                <FileText data-icon="inline-start" />
                Open report
              </Link>
              {latest.status === "completed" && (
                <Link
                  href={`/dashboard/analysis/${latest.id}/evidence`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <ShieldCheck data-icon="inline-start" />
                  Evidence
                </Link>
              )}
              {latest.manualReviewCount > 0 && (
                <Link
                  href={`/dashboard/analysis/${latest.id}/review`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Users data-icon="inline-start" />
                  Review
                </Link>
              )}
            </>
          ) : (
            <Link
              href="/dashboard/new-analysis"
              className={buttonVariants({ size: "sm" })}
            >
              <FilePlus2 data-icon="inline-start" />
              Start analysis
            </Link>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-5">
        {latest ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Wallets", latest.totalWallets, "text-foreground"],
                ["Approved", latest.approvedCount, "text-green-200"],
                ["Gray Zone", latest.manualReviewCount, "text-amber-200"],
                ["Not eligible", latest.rejectedCount, "text-red-200"],
              ].map(([label, value, valueClass]) => (
                <div
                  key={String(label)}
                  className="rounded-lg border border-border bg-background/45 p-3"
                >
                  <p className="text-xs text-muted-foreground">{String(label)}</p>
                  <p className={cn("mt-1 text-xl font-semibold", String(valueClass))}>
                    {formatNumber(Number(value))}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-background/45 p-3">
                <p className="text-xs text-muted-foreground">Average risk</p>
                <p className="mt-1 font-semibold">{latest.averageRiskScore.toFixed(1)}</p>
              </div>
              <div className="rounded-lg border border-border bg-background/45 p-3">
                <p className="text-xs text-muted-foreground">Suspicious clusters</p>
                <p className="mt-1 font-semibold">
                  {formatNumber(latest.suspiciousClustersCount)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background/45 p-3">
                <p className="text-xs text-muted-foreground">Latest status</p>
                <Badge
                  variant="outline"
                  className={cn("mt-1", analysisStatusClass(latest.status))}
                >
                  {titleCase(latest.status)}
                </Badge>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
            <ShieldQuestion className="mx-auto size-7 text-muted-foreground" />
            <p className="mt-3 font-medium">Campaign created, no analysis yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              The project remains unchanged. Start a wallet analysis when the
              participant list is ready.
            </p>
          </div>
        )}

        {project.analyses.length > 0 && (
          <details className="rounded-lg border border-border bg-background/35">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
              Analysis history ({formatNumber(project.analysisCount)})
            </summary>
            <div className="border-t border-border p-3">
              <div className="grid gap-2">
                {project.analyses.map((analysis, index) => (
                  <div
                    key={analysis.id}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-background/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={analysisStatusClass(analysis.status)}
                        >
                          {titleCase(analysis.status)}
                        </Badge>
                        {index === 0 && <Badge variant="secondary">Latest</Badge>}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {formatNumber(analysis.totalWallets)} wallets ·{" "}
                        {formatNumber(analysis.manualReviewCount)} Gray Zone ·{" "}
                        {formatDateTimeUTC(analysis.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/dashboard/analysis/${analysis.id}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Report
                      </Link>
                      {analysis.status === "completed" && (
                        <Link
                          href={`/dashboard/analysis/${analysis.id}/evidence`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          Evidence
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {project.analysisCount > project.analyses.length && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Showing the latest {project.analyses.length} analyses. The full
                  archive remains available under Reports.
                </p>
              )}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

export function CampaignsWorkspace({
  projects,
  loadError = false,
}: CampaignsWorkspaceProps) {
  const [query, setQuery] = useState("")
  const [chainFilter, setChainFilter] = useState("all")
  const [lifecycleFilter, setLifecycleFilter] =
    useState<LifecycleFilter>("all")

  const chains = useMemo(
    () => Array.from(new Set(projects.map((project) => project.chain))).sort(),
    [projects]
  )

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return projects.filter((project) => {
      const matchesQuery =
        !normalizedQuery ||
        project.name.toLowerCase().includes(normalizedQuery) ||
        project.campaignType.toLowerCase().includes(normalizedQuery) ||
        project.chain.toLowerCase().includes(normalizedQuery)
      const matchesChain =
        chainFilter === "all" || project.chain === chainFilter
      const matchesLifecycle =
        lifecycleFilter === "all" ||
        projectLifecycle(project) === lifecycleFilter
      return matchesQuery && matchesChain && matchesLifecycle
    })
  }, [chainFilter, lifecycleFilter, projects, query])

  const latestAnalyses = projects
    .map((project) => project.analyses[0])
    .filter((analysis): analysis is CampaignWorkspaceAnalysis => Boolean(analysis))

  const summary = {
    campaigns: projects.length,
    active: projects.filter(
      (project) => projectLifecycle(project) === "in_progress"
    ).length,
    wallets: latestAnalyses.reduce(
      (total, analysis) => total + analysis.totalWallets,
      0
    ),
    grayZone: latestAnalyses.reduce(
      (total, analysis) => total + analysis.manualReviewCount,
      0
    ),
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="dashboard-hero reveal-up flex flex-col gap-5 rounded-2xl p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div>
          <Badge variant="secondary" className="mb-4 gap-2 border-primary/30 text-primary">
            <ShieldCheck className="size-3.5" />
            Campaign Security Console
          </Badge>
          <h2 className="text-gradient text-3xl font-semibold sm:text-4xl">
            Campaigns Workspace
          </h2>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Manage every campaign, analysis, Gray Zone queue and explainable wallet
            decision from one place. Existing reports and the New Analysis flow remain
            unchanged.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/new-analysis"
            className={`${buttonVariants()} glow-primary hover-lift`}
          >
            <FilePlus2 data-icon="inline-start" />
            New Analysis
          </Link>
          <Link
            href="/dashboard/reports"
            className={buttonVariants({ variant: "outline" })}
          >
            <FileText data-icon="inline-start" />
            Reports
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Campaigns", summary.campaigns, BarChart3, "All owned projects"],
          ["Active", summary.active, Clock3, "Latest analysis processing"],
          ["Wallets", summary.wallets, CheckCircle2, "Latest campaign snapshots"],
          ["Gray Zone", summary.grayZone, ShieldQuestion, "Human review required"],
        ].map(([label, value, Icon, description]) => (
          <Card key={String(label)} className="glass-panel premium-card">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {String(label)}
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    {formatNumber(Number(value))}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {String(description)}
                  </p>
                </div>
                <div className="rounded-lg border border-primary/25 bg-primary/10 p-2 text-primary">
                  <Icon className="size-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Find a campaign</CardTitle>
          <CardDescription>
            Search by project name, campaign type or chain and narrow the workspace by
            operational state.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search campaigns"
                className="pl-9"
              />
            </label>
            <select
              value={chainFilter}
              onChange={(event) => setChainFilter(event.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Filter by chain"
            >
              <option value="all">All chains</option>
              {chains.map((chain) => (
                <option key={chain} value={chain}>
                  {chain}
                </option>
              ))}
            </select>
            <select
              value={lifecycleFilter}
              onChange={(event) =>
                setLifecycleFilter(event.target.value as LifecycleFilter)
              }
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Filter by lifecycle"
            >
              <option value="all">All lifecycle states</option>
              <option value="in_progress">In progress</option>
              <option value="needs_review">Needs review</option>
              <option value="completed">Completed</option>
              <option value="no_analysis">No analysis</option>
            </select>
            <Button
              variant="outline"
              onClick={() => {
                setQuery("")
                setChainFilter("all")
                setLifecycleFilter("all")
              }}
            >
              Clear
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {formatNumber(filteredProjects.length)} matching campaigns
          </p>
        </CardContent>
      </Card>

      {loadError && (
        <Card className="glass-panel border-amber-400/30 bg-amber-400/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-100">
              <XCircle className="size-5" />
              Campaigns are temporarily unavailable
            </CardTitle>
            <CardDescription>
              The workspace database could not be reached. Existing projects and
              analyses were not modified.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!loadError && projects.length === 0 && (
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle>No campaigns yet</CardTitle>
            <CardDescription>
              Start the existing analysis flow to create your first campaign and its
              explainable decision report.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link
              href="/dashboard/new-analysis"
              className={`${buttonVariants()} glow-primary`}
            >
              <FilePlus2 data-icon="inline-start" />
              Start analysis
            </Link>
            <Link
              href="/dashboard/demo"
              className={buttonVariants({ variant: "outline" })}
            >
              <BarChart3 data-icon="inline-start" />
              View demo
            </Link>
          </CardContent>
        </Card>
      )}

      {!loadError && projects.length > 0 && filteredProjects.length === 0 && (
        <Card className="glass-panel">
          <CardContent className="p-8 text-center text-muted-foreground">
            No campaign matches the selected filters.
          </CardContent>
        </Card>
      )}

      {!loadError && filteredProjects.length > 0 && (
        <section className="grid gap-4">
          {filteredProjects.map((project) => (
            <CampaignCard key={project.id} project={project} />
          ))}
        </section>
      )}
    </div>
  )
}
