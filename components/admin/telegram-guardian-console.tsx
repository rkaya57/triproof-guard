"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Database,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type AlertLevel = "CAUTION" | "HIGH_RISK" | "CRITICAL"
type SafeMode = "SILENT" | "COMPACT" | "FULL"
type ModerationAction = "WARN_ONLY" | "ADMIN_REVIEW" | "DELETE" | "DELETE_MUTE_1H" | "DELETE_MUTE_24H"

type PermissionSnapshot = {
  canReadMessages?: boolean
  canDeleteMessages?: boolean
  canRestrictMembers?: boolean
  canManageChat?: boolean
}

type GuardianGroup = {
  id: string
  telegramChatId: string
  title: string | null
  username: string | null
  guardianEnabled: boolean
  allowlisted: boolean
  alertLevel: AlertLevel
  dailySummary: boolean
  autoMuteCritical: boolean
  safeMode: SafeMode
  highRiskAction: ModerationAction
  criticalAction: ModerationAction
  permissionSnapshot: PermissionSnapshot | null
  lastPermissionCheckAt: string | null
  scanCount: number
  alertCount: number
  lastSeenAt: string
  lastSummaryAt: string | null
  createdAt: string
}

type RecentScan = {
  id: string
  telegramChatId: string
  target: string
  domain: string | null
  riskLevel: string
  score: number
  alerted: boolean
  source: string
  createdAt: string
  group: { title: string | null } | null
}

type Overview = {
  stats: {
    groups: number
    activeGroups: number
    scans24h: number
    alerts24h: number
    deliveryFailures24h: number
    processedUpdates24h: number
    registryProjects: number
  }
  groups: GuardianGroup[]
  recentScans: RecentScan[]
}

type RegistryAsset = {
  id: string
  kind: "DOMAIN" | "X_HANDLE" | "TELEGRAM_HANDLE" | "EVM_ADDRESS" | "SOLANA_ADDRESS" | "BRAND_ALIAS"
  value: string
  chain: string
  active: boolean
}

type RegistryProject = {
  id: string
  name: string
  slug: string
  notes: string | null
  active: boolean
  assets: RegistryAsset[]
}

const emptyOverview: Overview = {
  stats: {
    groups: 0,
    activeGroups: 0,
    scans24h: 0,
    alerts24h: 0,
    deliveryFailures24h: 0,
    processedUpdates24h: 0,
    registryProjects: 0,
  },
  groups: [],
  recentScans: [],
}

const selectClass = "rounded-md border border-border bg-background px-2 py-2 text-xs text-white"
const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-white outline-none focus:border-primary"

function riskTone(level: string) {
  if (level === "CRITICAL") return "border-red-400/30 bg-red-400/10 text-red-100"
  if (level === "HIGH_RISK") return "border-orange-400/30 bg-orange-400/10 text-orange-100"
  if (level === "CAUTION") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-100"
  return "border-green-400/30 bg-green-400/10 text-green-100"
}

function moderationLabel(action: ModerationAction) {
  if (action === "WARN_ONLY") return "Warn"
  if (action === "ADMIN_REVIEW") return "Review"
  if (action === "DELETE") return "Delete"
  if (action === "DELETE_MUTE_1H") return "Delete + mute 1h"
  return "Delete + mute 24h"
}

function permissionLabel(group: GuardianGroup) {
  if (!group.lastPermissionCheckAt || !group.permissionSnapshot) return "Not checked"
  const snapshot = group.permissionSnapshot
  if (snapshot.canDeleteMessages && snapshot.canRestrictMembers) return "Ready"
  return "Limited"
}

export function TelegramGuardianConsole() {
  const [overview, setOverview] = useState<Overview>(emptyOverview)
  const [projects, setProjects] = useState<RegistryProject[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState("")
  const [registrySaving, setRegistrySaving] = useState(false)
  const [error, setError] = useState("")
  const [projectForm, setProjectForm] = useState({
    name: "",
    domain: "",
    xHandle: "",
    telegramHandle: "",
    brandAlias: "",
    notes: "",
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [groupsResponse, projectsResponse] = await Promise.all([
        fetch("/api/admin/telegram/groups", { cache: "no-store" }),
        fetch("/api/admin/telegram/projects", { cache: "no-store" }),
      ])
      const groupsBody = (await groupsResponse.json().catch(() => ({}))) as Overview & { error?: string }
      const projectsBody = (await projectsResponse.json().catch(() => ({}))) as { projects?: RegistryProject[]; error?: string }
      if (!groupsResponse.ok) throw new Error(groupsBody.error ?? "Telegram Guardian data could not be loaded")
      if (!projectsResponse.ok) throw new Error(projectsBody.error ?? "Verified project registry could not be loaded")
      setOverview(groupsBody)
      setProjects(projectsBody.projects ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Telegram Guardian data could not be loaded")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function updateGroup(
    id: string,
    values: Partial<Pick<
      GuardianGroup,
      | "guardianEnabled"
      | "allowlisted"
      | "alertLevel"
      | "dailySummary"
      | "autoMuteCritical"
      | "safeMode"
      | "highRiskAction"
      | "criticalAction"
    >>
  ) {
    setSavingId(id)
    setError("")
    try {
      const response = await fetch("/api/admin/telegram/groups", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...values }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Group settings could not be updated")
      await load()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Group settings could not be updated")
    } finally {
      setSavingId("")
    }
  }

  const registryAssets = useMemo(() => {
    const values = [
      projectForm.domain ? { kind: "DOMAIN" as const, value: projectForm.domain } : null,
      projectForm.xHandle ? { kind: "X_HANDLE" as const, value: projectForm.xHandle } : null,
      projectForm.telegramHandle ? { kind: "TELEGRAM_HANDLE" as const, value: projectForm.telegramHandle } : null,
      projectForm.brandAlias ? { kind: "BRAND_ALIAS" as const, value: projectForm.brandAlias } : null,
    ]
    return values.filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
  }, [projectForm])

  async function createProject() {
    if (!projectForm.name.trim() || !registryAssets.length) {
      setError("Project name and at least one official asset are required.")
      return
    }
    setRegistrySaving(true)
    setError("")
    try {
      const response = await fetch("/api/admin/telegram/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: projectForm.name,
          notes: projectForm.notes || null,
          assets: registryAssets,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Verified project could not be created")
      setProjectForm({ name: "", domain: "", xHandle: "", telegramHandle: "", brandAlias: "", notes: "" })
      await load()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Verified project could not be created")
    } finally {
      setRegistrySaving(false)
    }
  }

  async function toggleProject(project: RegistryProject) {
    setSavingId(project.id)
    setError("")
    try {
      const response = await fetch("/api/admin/telegram/projects", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: project.id, active: !project.active }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Verified project could not be updated")
      await load()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Verified project could not be updated")
    } finally {
      setSavingId("")
    }
  }

  async function deleteProject(project: RegistryProject) {
    if (!window.confirm(`Delete ${project.name} from the verified project registry?`)) return
    setSavingId(project.id)
    setError("")
    try {
      const response = await fetch("/api/admin/telegram/projects", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: project.id }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Verified project could not be deleted")
      await load()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Verified project could not be deleted")
    } finally {
      setSavingId("")
    }
  }

  const metrics = [
    [ShieldCheck, "Known groups", overview.stats.groups, "text-cyan-200"],
    [CheckCircle2, "Protected groups", overview.stats.activeGroups, "text-green-200"],
    [Activity, "Scans in 24h", overview.stats.scans24h, "text-sky-200"],
    [BellRing, "Alerts in 24h", overview.stats.alerts24h, "text-yellow-200"],
    [Database, "Registry projects", overview.stats.registryProjects, "text-violet-200"],
    [AlertTriangle, "Delivery failures", overview.stats.deliveryFailures24h, overview.stats.deliveryFailures24h ? "text-red-200" : "text-green-200"],
  ] as const

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {metrics.map(([Icon, label, value, tone]) => (
          <Card key={label} className="glass-panel premium-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardDescription className="text-slate-300">{label}</CardDescription>
                <Icon className="size-4 text-primary" />
              </div>
              <CardTitle className={`text-3xl ${tone}`}>{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </section>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      <Card className="glass-panel premium-card">
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-white">Protected Telegram groups</CardTitle>
            <CardDescription className="text-slate-300">
              Configure quiet SAFE handling, alert thresholds, and automatic quarantine policies.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading} title="Refresh groups">
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[1550px] text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="py-3">Group</th>
                <th>Approval</th>
                <th>Guardian</th>
                <th>Threshold</th>
                <th>SAFE mode</th>
                <th>High-risk policy</th>
                <th>Critical policy</th>
                <th>Daily report</th>
                <th>Permissions</th>
                <th>Scans</th>
                <th>Alerts</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {overview.groups.map((group) => {
                const saving = savingId === group.id
                return (
                  <tr key={group.id} className="border-t border-border align-top">
                    <td className="py-4 pr-4">
                      <p className="font-medium text-white">{group.title ?? "Unnamed group"}</p>
                      <p className="font-mono text-xs text-slate-500">{group.telegramChatId}</p>
                    </td>
                    <td>
                      <Button type="button" size="sm" variant={group.allowlisted ? "default" : "outline"} disabled={saving} onClick={() => void updateGroup(group.id, { allowlisted: !group.allowlisted })}>
                        {saving ? <Loader2 className="animate-spin" /> : null}
                        {group.allowlisted ? "Approved" : "Blocked"}
                      </Button>
                    </td>
                    <td>
                      <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void updateGroup(group.id, { guardianEnabled: !group.guardianEnabled })}>
                        {group.guardianEnabled ? "On" : "Off"}
                      </Button>
                    </td>
                    <td>
                      <select className={selectClass} value={group.alertLevel} disabled={saving} onChange={(event) => void updateGroup(group.id, { alertLevel: event.target.value as AlertLevel })}>
                        <option value="CAUTION">Caution</option>
                        <option value="HIGH_RISK">High risk</option>
                        <option value="CRITICAL">Critical</option>
                      </select>
                    </td>
                    <td>
                      <select className={selectClass} value={group.safeMode} disabled={saving} onChange={(event) => void updateGroup(group.id, { safeMode: event.target.value as SafeMode })}>
                        <option value="SILENT">Silent</option>
                        <option value="COMPACT">Compact</option>
                        <option value="FULL">Full</option>
                      </select>
                    </td>
                    <td>
                      <select className={selectClass} value={group.highRiskAction} disabled={saving} onChange={(event) => void updateGroup(group.id, { highRiskAction: event.target.value as ModerationAction })}>
                        <option value="WARN_ONLY">Warn only</option>
                        <option value="ADMIN_REVIEW">Admin review</option>
                        <option value="DELETE">Delete</option>
                        <option value="DELETE_MUTE_1H">Delete + mute 1h</option>
                        <option value="DELETE_MUTE_24H">Delete + mute 24h</option>
                      </select>
                    </td>
                    <td>
                      <select className={selectClass} value={group.criticalAction} disabled={saving} onChange={(event) => void updateGroup(group.id, { criticalAction: event.target.value as ModerationAction })}>
                        <option value="WARN_ONLY">Warn only</option>
                        <option value="ADMIN_REVIEW">Admin review</option>
                        <option value="DELETE">Delete</option>
                        <option value="DELETE_MUTE_1H">Delete + mute 1h</option>
                        <option value="DELETE_MUTE_24H">Delete + mute 24h</option>
                      </select>
                    </td>
                    <td>
                      <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void updateGroup(group.id, { dailySummary: !group.dailySummary })}>
                        {group.dailySummary ? "On" : "Off"}
                      </Button>
                    </td>
                    <td>
                      <Badge className={permissionLabel(group) === "Ready" ? "border-green-400/30 bg-green-400/10 text-green-100" : "border-yellow-400/30 bg-yellow-400/10 text-yellow-100"}>
                        {permissionLabel(group)}
                      </Badge>
                      <p className="mt-1 max-w-36 text-xs text-slate-500">Run /guardian permissions in the group.</p>
                    </td>
                    <td className="text-slate-200">{group.scanCount}</td>
                    <td className="text-yellow-200">{group.alertCount}</td>
                    <td className="text-xs text-slate-400">{new Date(group.lastSeenAt).toLocaleString()}</td>
                  </tr>
                )
              })}
              {!overview.groups.length && (
                <tr>
                  <td colSpan={12} className="py-10 text-center text-slate-400">
                    {loading ? "Loading Telegram groups..." : "No Telegram group has contacted the bot yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle className="text-white">Verified Project Registry</CardTitle>
          <CardDescription className="text-slate-300">
            Register official domains and social handles so Group Guardian can detect lookalike brands and impersonation attempts.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-3 rounded-xl border border-border bg-background/40 p-4 lg:grid-cols-2 xl:grid-cols-3">
            <input className={inputClass} placeholder="Project name" value={projectForm.name} onChange={(event) => setProjectForm((current) => ({ ...current, name: event.target.value }))} />
            <input className={inputClass} placeholder="Official domain, e.g. example.com" value={projectForm.domain} onChange={(event) => setProjectForm((current) => ({ ...current, domain: event.target.value }))} />
            <input className={inputClass} placeholder="Official X handle" value={projectForm.xHandle} onChange={(event) => setProjectForm((current) => ({ ...current, xHandle: event.target.value }))} />
            <input className={inputClass} placeholder="Official Telegram handle" value={projectForm.telegramHandle} onChange={(event) => setProjectForm((current) => ({ ...current, telegramHandle: event.target.value }))} />
            <input className={inputClass} placeholder="Brand alias" value={projectForm.brandAlias} onChange={(event) => setProjectForm((current) => ({ ...current, brandAlias: event.target.value }))} />
            <input className={inputClass} placeholder="Notes (optional)" value={projectForm.notes} onChange={(event) => setProjectForm((current) => ({ ...current, notes: event.target.value }))} />
            <Button type="button" onClick={() => void createProject()} disabled={registrySaving} className="lg:col-span-2 xl:col-span-3">
              {registrySaving ? <Loader2 className="animate-spin" /> : <Plus />}
              Add verified project
            </Button>
          </div>

          <div className="grid gap-3">
            {projects.map((project) => (
              <div key={project.id} className="grid gap-3 rounded-xl border border-border bg-background/40 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-white">{project.name}</p>
                    <Badge className={project.active ? "border-green-400/30 bg-green-400/10 text-green-100" : "border-slate-400/30 bg-slate-400/10 text-slate-200"}>
                      {project.active ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {project.assets.map((asset) => (
                      <span key={asset.id} className="rounded-md border border-border px-2 py-1 text-xs text-slate-300">
                        {asset.kind.replaceAll("_", " ").toLowerCase()}: {asset.value}
                      </span>
                    ))}
                  </div>
                  {project.notes ? <p className="mt-2 text-xs text-slate-400">{project.notes}</p> : null}
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={savingId === project.id} onClick={() => void toggleProject(project)}>
                    {project.active ? "Pause" : "Activate"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={savingId === project.id} onClick={() => void deleteProject(project)} title={`Delete ${project.name}`}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
            {!projects.length && !loading ? <p className="py-8 text-center text-slate-400">No verified projects have been registered.</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle className="text-white">Recent Guardian activity</CardTitle>
          <CardDescription className="text-slate-300">
            Latest private scans and community checks, without storing raw transaction payloads.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {overview.recentScans.map((scan) => (
            <div key={scan.id} className="grid gap-3 rounded-lg border border-border bg-background/40 p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
              <div className="min-w-0">
                <p className="truncate font-medium text-white">{scan.domain ?? scan.target}</p>
                <p className="text-xs text-slate-400">
                  {scan.group?.title ?? "Private scan"} · {scan.source.replaceAll("_", " ").toLowerCase()} · {new Date(scan.createdAt).toLocaleString()}
                </p>
              </div>
              <Badge className={riskTone(scan.riskLevel)}>{scan.riskLevel.replace("_", " ")}</Badge>
              <p className="font-mono text-sm text-cyan-100">{scan.score}/100</p>
            </div>
          ))}
          {!overview.recentScans.length && !loading ? <p className="py-8 text-center text-slate-400">No Telegram scan activity has been recorded yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
