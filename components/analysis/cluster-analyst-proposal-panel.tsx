"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  History,
  MessageSquare,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"
import {
  MAX_SPLIT_PROPOSAL_MEMBERS,
  clusterAnalystProposalLabel,
  clusterAnalystProposalTypes,
  type ClusterAnalystProposalRecord,
  type ClusterAnalystProposalType,
} from "@/lib/cluster-investigation/proposals"
import { formatDateTimeUTC } from "@/lib/format"
import { cn } from "@/lib/utils"

type ProposalState = {
  storageAvailable: boolean
  history: ClusterAnalystProposalRecord[]
  applyWorkflowAvailable: boolean
}

const proposalDescriptions: Record<ClusterAnalystProposalType, string> = {
  mark_likely_legitimate: "Record an analyst hypothesis that the reviewed context appears more consistent with legitimate shared infrastructure or organic activity.",
  mark_suspicious: "Record a suspicious-pattern hypothesis for follow-up. This does not change wallet status or campaign policy.",
  needs_review: "Record that additional analyst review or evidence collection is required.",
  merge_clusters: "Propose that this investigation unit and another stored cluster should be reviewed as a possible combined unit.",
  split_cluster: "Propose moving selected members into a separate future investigation unit. Stored membership is not changed.",
  analyst_note: "Append a general analyst observation to the immutable proposal audit trail.",
}

function proposalClass(type: ClusterAnalystProposalType) {
  if (type === "mark_likely_legitimate") return "border-green-400/35 bg-green-400/10 text-green-200"
  if (type === "mark_suspicious") return "border-red-400/35 bg-red-400/10 text-red-200"
  if (type === "merge_clusters" || type === "split_cluster") return "border-violet-400/35 bg-violet-400/10 text-violet-200"
  if (type === "needs_review") return "border-amber-400/35 bg-amber-400/10 text-amber-200"
  return "border-cyan-400/35 bg-cyan-400/10 text-cyan-200"
}

function memberKey(chain: string, walletAddress: string) {
  return `${chain}\u0000${walletAddress}`
}

function proposalPayloadSummary(proposal: ClusterAnalystProposalRecord) {
  if ("targetClusterLabel" in proposal.payload) {
    return `Target cluster: ${proposal.payload.targetClusterLabel}`
  }
  if ("members" in proposal.payload) {
    return `${proposal.payload.members.length} member${proposal.payload.members.length === 1 ? "" : "s"} proposed for split`
  }
  return null
}

export function ClusterAnalystProposalPanel({ report }: { report: ClusterInvestigationReport }) {
  return <ClusterAnalystProposalPanelContent key={`${report.analysisId}:${report.cluster.clusterLabel}`} report={report} />
}

function ClusterAnalystProposalPanelContent({ report }: { report: ClusterInvestigationReport }) {
  const [state, setState] = useState<ProposalState | null>(null)
  const [proposalType, setProposalType] = useState<ClusterAnalystProposalType>("needs_review")
  const [notes, setNotes] = useState("")
  const [targetClusterLabel, setTargetClusterLabel] = useState("")
  const [splitQuery, setSplitQuery] = useState("")
  const [selectedMemberKeys, setSelectedMemberKeys] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const encodedLabel = useMemo(() => encodeURIComponent(report.cluster.clusterLabel), [report.cluster.clusterLabel])
  const proposalsPath = `/api/analysis/${report.analysisId}/clusters/${encodedLabel}/proposals`

  const visibleSplitMembers = useMemo(() => {
    const query = splitQuery.trim().toLowerCase()
    return report.members
      .filter((member) => !query || member.walletAddress.toLowerCase().includes(query) || member.chain.toLowerCase().includes(query))
      .slice(0, 100)
  }, [report.members, splitQuery])

  const requestData = useCallback((signal?: AbortSignal) => {
    return fetch(proposalsPath, { cache: "no-store", signal }).then(async (response) => {
      const body = (await response.json().catch(() => ({}))) as ProposalState & { error?: string }
      if (signal?.aborted) return
      if (!response.ok) throw new Error(body.error ?? "Analyst proposal history could not be loaded")
      setState(body)
    }).catch((loadError) => {
      if (signal?.aborted) return
      setError(loadError instanceof Error ? loadError.message : "Analyst proposal history could not be loaded")
    }).finally(() => {
      if (!signal?.aborted) setLoading(false)
    })
  }, [proposalsPath])

  async function loadHistory() {
    setLoading(true)
    setError("")
    await requestData()
  }

  useEffect(() => {
    const controller = new AbortController()
    void requestData(controller.signal)
    return () => controller.abort()
  }, [requestData])

  function toggleMember(chain: string, walletAddress: string) {
    const key = memberKey(chain, walletAddress)
    setSelectedMemberKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else if (next.size < MAX_SPLIT_PROPOSAL_MEMBERS) next.add(key)
      return next
    })
  }

  async function saveProposal() {
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const payload = proposalType === "merge_clusters"
        ? { targetClusterLabel }
        : proposalType === "split_cluster"
          ? {
              members: report.members
                .filter((member) => selectedMemberKeys.has(memberKey(member.chain, member.walletAddress)))
                .map((member) => ({ walletAddress: member.walletAddress, chain: member.chain })),
            }
          : {}
      const response = await fetch(proposalsPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalType, payload, notes, source: "cluster_workspace" }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        error?: string
        proposal?: ClusterAnalystProposalRecord
        mutatedClusterMembership?: boolean
        mutatedWalletDecisionState?: boolean
        applyWorkflowAvailable?: boolean
      }
      if (!response.ok || !body.proposal) throw new Error(body.error ?? "Analyst proposal could not be saved")
      setNotes("")
      setTargetClusterLabel("")
      setSelectedMemberKeys(new Set())
      setMessage("Proposal saved to the append-only audit trail. No cluster membership or wallet decision was changed.")
      await loadHistory()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Analyst proposal could not be saved")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-5 px-5 pb-5 sm:px-8 xl:grid-cols-[1.25fr_0.75fr]">
      <Card className="glass-panel premium-card border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GitBranch className="size-5 text-primary" /> Manual Analyst Actions v1</CardTitle>
          <CardDescription>
            Create append-only investigation proposals. This workspace records analyst hypotheses and structural suggestions; it cannot apply a merge, split, risk change, or policy change.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {clusterAnalystProposalTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setProposalType(type)}
                className={cn(
                  "rounded-xl border p-4 text-left transition",
                  proposalType === type
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-background/45 hover:border-primary/30",
                )}
              >
                <Badge variant="outline" className={proposalClass(type)}>{clusterAnalystProposalLabel(type)}</Badge>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{proposalDescriptions[type]}</p>
              </button>
            ))}
          </div>

          {proposalType === "merge_clusters" && (
            <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Target stored cluster</p>
              <Input
                value={targetClusterLabel}
                onChange={(event) => setTargetClusterLabel(event.target.value)}
                maxLength={120}
                placeholder="Example: CL-014"
              />
              <p className="mt-2 text-xs text-muted-foreground">The server verifies that the target exists in this same analysis and is different from {report.cluster.clusterLabel}.</p>
            </div>
          )}

          {proposalType === "split_cluster" && (
            <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Proposed split members</p>
                  <p className="mt-1 text-sm">{selectedMemberKeys.size} selected · max {MAX_SPLIT_PROPOSAL_MEMBERS}</p>
                </div>
                <div className="relative sm:w-80">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={splitQuery} onChange={(event) => setSplitQuery(event.target.value)} placeholder="Search wallet or chain..." className="pl-9" />
                </div>
              </div>
              <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-border bg-background/35">
                {visibleSplitMembers.map((member) => {
                  const key = memberKey(member.chain, member.walletAddress)
                  const checked = selectedMemberKeys.has(key)
                  return (
                    <label key={key} className="flex cursor-pointer items-center gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMember(member.chain, member.walletAddress)}
                        className="size-4 accent-primary"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs">{member.walletAddress}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{member.chain} · stored status {member.status}</p>
                      </div>
                    </label>
                  )
                })}
                {!visibleSplitMembers.length && <p className="p-4 text-sm text-muted-foreground">No stored cluster member matches this search.</p>}
              </div>
              {report.members.length > 100 && (
                <p className="mt-2 text-xs text-muted-foreground">The list renders the first 100 search matches. Search narrows against all {report.members.length} stored members.</p>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Required analyst rationale</p>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={4000}
              placeholder="Describe the evidence reviewed, why this proposal is useful, and any uncertainty that remains..."
              className="min-h-28"
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">{notes.length}/4000 · minimum 8 characters</p>
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-red-400/25 bg-red-400/5 p-4 text-sm text-red-100">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
            </div>
          )}
          {message && (
            <div className="flex items-start gap-3 rounded-xl border border-green-400/25 bg-green-400/5 p-4 text-sm text-green-100">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {message}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void saveProposal()} disabled={saving || loading || state?.storageAvailable === false}>
              {saving ? <RotateCcw data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
              Save audit proposal
            </Button>
            <Button variant="outline" onClick={() => void loadHistory()} disabled={loading}>
              <RotateCcw data-icon="inline-start" className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            {state?.storageAvailable === false && <span className="text-xs text-amber-200">Proposal storage migration is not deployed on this environment yet.</span>}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-green-100"><ShieldCheck className="size-4" /> Append-only</p>
              <p className="mt-2 text-xs text-muted-foreground">Every saved proposal remains a separate historical audit event.</p>
            </div>
            <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-red-100"><ShieldAlert className="size-4" /> No apply path</p>
              <p className="mt-2 text-xs text-muted-foreground">There is no merge/split apply endpoint in v1.</p>
            </div>
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-cyan-100"><MessageSquare className="size-4" /> Hypothesis only</p>
              <p className="mt-2 text-xs text-muted-foreground">Analyst labels do not assert wallet-owner identity or malicious intent.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History className="size-5 text-primary" /> Analyst proposal audit</CardTitle>
          <CardDescription>Newest append-only proposal is shown first. No proposal in this list is an applied cluster edit.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {state?.history.slice(0, 8).map((proposal) => {
            const payloadSummary = proposalPayloadSummary(proposal)
            return (
              <div key={proposal.id} className="rounded-xl border border-border bg-background/45 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="outline" className={proposalClass(proposal.proposalType)}>{clusterAnalystProposalLabel(proposal.proposalType)}</Badge>
                  <span className="text-[11px] text-muted-foreground">{formatDateTimeUTC(proposal.createdAt)}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Analyst: {proposal.analystName}</p>
                {payloadSummary && <p className="mt-2 text-xs font-medium text-violet-100">{payloadSummary}</p>}
                {proposal.notes && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{proposal.notes}</p>}
              </div>
            )
          })}
          {!loading && state?.storageAvailable !== false && !state?.history.length && (
            <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No analyst proposal has been recorded for this cluster yet.</p>
          )}
          {loading && <p className="text-sm text-muted-foreground">Loading analyst proposal history…</p>}
        </CardContent>
      </Card>
    </div>
  )
}
