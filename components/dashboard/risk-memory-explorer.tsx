"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  History,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatNumber } from "@/lib/format"
import type {
  CrossCampaignRiskMemory,
  RiskMemoryMatch,
  RiskMemoryOccurrence,
} from "@/lib/risk-memory/types"
import { cn } from "@/lib/utils"

type Filter =
  | "all"
  | "participant"
  | "infrastructure"
  | "cross_role"
  | "prior_rejection"
  | "telegram"

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function decisionLabel(occurrence: RiskMemoryOccurrence) {
  return occurrence.finalDecision ?? occurrence.originalDecision ?? "no decision"
}

function decisionClass(value: string) {
  if (value === "rejected") return "border-red-400/35 bg-red-400/10 text-red-200"
  if (value === "manual_review") return "border-amber-400/35 bg-amber-400/10 text-amber-200"
  if (value === "approved") return "border-green-400/35 bg-green-400/10 text-green-200"
  return "text-muted-foreground"
}

function MatchCard({
  match,
  selected,
  onSelect,
}: {
  match: RiskMemoryMatch
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border p-4 text-left transition hover:border-primary/50 hover:bg-primary/5",
        selected ? "border-primary bg-primary/10" : "border-border bg-background/45"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{title(match.identityKind)}</Badge>
            {match.chain && <Badge variant="secondary">{match.chain}</Badge>}
            {match.crossRole && (
              <Badge variant="outline" className="border-violet-400/35 text-violet-200">
                Cross-role
              </Badge>
            )}
            {match.priorRejectedCount > 0 && (
              <Badge variant="outline" className="border-red-400/35 text-red-200">
                Prior rejection
              </Badge>
            )}
          </div>
          <p className="mt-3 break-all font-medium">{match.value}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {match.campaignCount} campaigns · roles: {match.roles.map(title).join(", ")}
          </p>
        </div>
        <div className="shrink-0 rounded-lg border border-border bg-background/70 px-2 py-1 text-xs text-muted-foreground">
          {match.occurrences.length} records
        </div>
      </div>
    </button>
  )
}

function OccurrenceCard({
  occurrence,
  currentCampaignId,
}: {
  occurrence: RiskMemoryOccurrence
  currentCampaignId: string
}) {
  const decision = decisionLabel(occurrence)
  const current = occurrence.campaignId === currentCampaignId
  return (
    <div className={cn("rounded-xl border p-4", current ? "border-primary/35 bg-primary/5" : "border-border bg-background/45")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={current ? "default" : "outline"}>{current ? "Current campaign" : "Prior campaign"}</Badge>
          <Badge variant="outline">{title(occurrence.role)}</Badge>
          <Badge variant="outline" className={decisionClass(decision)}>{title(decision)}</Badge>
        </div>
        {occurrence.riskScore !== null && (
          <span className="text-xs text-muted-foreground">Risk {occurrence.riskScore}/100</span>
        )}
      </div>
      <Link
        href={`/dashboard/campaigns/${occurrence.campaignId}`}
        className="mt-3 inline-block font-medium text-primary hover:underline"
      >
        {occurrence.campaignName}
      </Link>
      <p className="mt-2 text-xs text-muted-foreground">
        Source: {title(occurrence.source)}
        {occurrence.componentId ? ` · Component ${occurrence.componentId}` : ""}
        {occurrence.observedAt ? ` · ${new Date(occurrence.observedAt).toLocaleString()}` : ""}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{occurrence.evidence}</p>
    </div>
  )
}

export function RiskMemoryExplorer({ memory }: { memory: CrossCampaignRiskMemory }) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [selectedKey, setSelectedKey] = useState<string | null>(memory.matches[0]?.key ?? null)

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return memory.matches.filter((match) => {
      const queryMatch =
        !normalized ||
        match.value.toLowerCase().includes(normalized) ||
        match.roles.some((role) => role.includes(normalized)) ||
        match.occurrences.some((occurrence) =>
          occurrence.campaignName.toLowerCase().includes(normalized)
        )
      const filterMatch =
        filter === "all" ||
        (filter === "participant" && match.roles.includes("participant")) ||
        (filter === "infrastructure" && match.roles.some((role) => ["funder", "referrer", "service", "token", "contract", "program", "domain", "url"].includes(role))) ||
        (filter === "cross_role" && match.crossRole) ||
        (filter === "prior_rejection" && match.priorRejectedCount > 0) ||
        (filter === "telegram" && match.telegramEvidenceCount > 0)
      return queryMatch && filterMatch
    })
  }, [filter, memory.matches, query])

  const selected = memory.matches.find((match) => match.key === selectedKey) ?? null
  const truncated =
    memory.coverage.graphNodesTruncated ||
    memory.coverage.walletAnalysesTruncated ||
    memory.coverage.telegramEventsTruncated

  return (
    <div className="flex flex-col gap-6">
      <section className="dashboard-hero reveal-up rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="secondary" className="mb-4 gap-2 border-primary/30 text-primary">
              <History className="size-3.5" /> Cross-Campaign Risk Memory v1
            </Badge>
            <h2 className="text-gradient text-3xl font-semibold sm:text-4xl">{memory.campaignName}</h2>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              Exact identities seen in this campaign and at least one prior campaign, with role history,
              human decisions and Telegram-linked evidence preserved separately.
            </p>
          </div>
          <Link href={`/dashboard/campaigns/${memory.campaignId}`} className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft data-icon="inline-start" /> Campaign details
          </Link>
        </div>
      </section>

      <Card className="glass-panel premium-card border-amber-400/25">
        <CardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" />
          <p>
            Recurrence is contextual evidence, not an automatic Sybil or fraud verdict. A repeated exchange,
            service, funder or legitimate participant can be benign; final action still requires independent evidence.
          </p>
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Repeated identities", memory.summary.matchedEntities],
          ["Participants", memory.summary.repeatedParticipants],
          ["Infrastructure", memory.summary.repeatedInfrastructure],
          ["Cross-role", memory.summary.crossRoleEntities],
          ["Prior rejection", memory.summary.entitiesWithPriorRejection],
        ].map(([name, value]) => (
          <Card key={String(name)} className="glass-panel premium-card">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{String(name)}</p>
              <p className="mt-2 text-2xl font-semibold">{formatNumber(Number(value))}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className={cn("glass-panel premium-card", truncated && "border-amber-400/30")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /> Coverage</CardTitle>
          <CardDescription>
            {truncated ? "One or more safety limits were reached; results are partial." : "All records inside the configured v1 limits were evaluated."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">{memory.coverage.campaignsConsidered} campaigns</Badge>
          <Badge variant="outline">{memory.coverage.analysesConsidered} latest analyses</Badge>
          <Badge variant="outline">{memory.coverage.graphNodesRead} graph nodes</Badge>
          <Badge variant="outline">{memory.coverage.walletAnalysesRead} wallet decisions</Badge>
          <Badge variant="outline">{memory.coverage.telegramEventsRead} Telegram events</Badge>
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)]">
        <Card className="glass-panel premium-card min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="size-5 text-primary" /> Recurring identities</CardTitle>
            <CardDescription>Search exact identities or narrow the operational signal type.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search address, domain, role or campaign..." className="pl-9" />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", "participant", "infrastructure", "cross_role", "prior_rejection", "telegram"] as Filter[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={cn(buttonVariants({ variant: filter === item ? "default" : "outline", size: "sm" }))}
                >
                  {title(item)}
                </button>
              ))}
            </div>
            <div className="grid max-h-[760px] gap-3 overflow-y-auto pr-1">
              {filtered.map((match) => (
                <MatchCard
                  key={match.key}
                  match={match}
                  selected={selectedKey === match.key}
                  onSelect={() => setSelectedKey(match.key)}
                />
              ))}
              {filtered.length === 0 && (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No exact cross-campaign matches meet these filters.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card h-fit xl:sticky xl:top-5">
          <CardHeader>
            <CardTitle>Identity history</CardTitle>
            <CardDescription>
              {selected ? `${selected.campaignCount} campaigns and ${selected.occurrences.length} evidence records` : "Select an identity"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selected && (
              <>
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                  <p className="break-all font-semibold">{selected.value}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected.roles.map((role) => <Badge key={role} variant="outline">{title(role)}</Badge>)}
                  </div>
                </div>
                <div className="space-y-2">
                  {selected.signals.map((signal) => (
                    <p key={signal} className="rounded-lg border border-border bg-background/45 p-3 text-xs leading-relaxed text-muted-foreground">
                      {signal}
                    </p>
                  ))}
                </div>
                <div className="space-y-3">
                  {selected.occurrences.map((occurrence, index) => (
                    <OccurrenceCard
                      key={`${occurrence.campaignId}:${occurrence.role}:${occurrence.source}:${index}`}
                      occurrence={occurrence}
                      currentCampaignId={memory.campaignId}
                    />
                  ))}
                </div>
              </>
            )}
            {!selected && <p className="text-sm text-muted-foreground">No identity selected.</p>}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
