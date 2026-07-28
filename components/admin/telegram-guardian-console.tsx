"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Activity,
  BellRing,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type AlertLevel = "CAUTION" | "HIGH_RISK" | "CRITICAL"

type GuardianGroup = {
  id: string
  telegramChatId: string
  title: string | null
  username: string | null
  guardianEnabled: boolean
  allowlisted: boolean
  alertLevel: AlertLevel
  dailySummary: boolean
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
  }
  groups: GuardianGroup[]
  recentScans: RecentScan[]
}

const emptyOverview: Overview = {
  stats: { groups: 0, activeGroups: 0, scans24h: 0, alerts24h: 0 },
  groups: [],
  recentScans: [],
}

function riskTone(level: string) {
  if (level === "CRITICAL") return "border-red-400/30 bg-red-400/10 text-red-100"
  if (level === "HIGH_RISK") return "border-orange-400/30 bg-orange-400/10 text-orange-100"
  if (level === "CAUTION") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-100"
  return "border-green-400/30 bg-green-400/10 text-green-100"
}

export function TelegramGuardianConsole() {
  const [overview, setOverview] = useState<Overview>(emptyOverview)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/admin/telegram/groups", { cache: "no-store" })
      const body = (await response.json().catch(() => ({}))) as Overview & { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Telegram Guardian data could not be loaded")
      setOverview(body)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Telegram Guardian data could not be loaded")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function updateGroup(id: string, values: Partial<Pick<GuardianGroup, "guardianEnabled" | "allowlisted" | "alertLevel" | "dailySummary">>) {
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

  const metrics = [
    [ShieldCheck, "Known groups", overview.stats.groups, "text-cyan-200"],
    [CheckCircle2, "Protected groups", overview.stats.activeGroups, "text-green-200"],
    [Activity, "Scans in 24h", overview.stats.scans24h, "text-sky-200"],
    [BellRing, "Alerts in 24h", overview.stats.alerts24h, "text-yellow-200"],
  ] as const

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              Approve communities, tune alert sensitivity, and control daily reports.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading} title="Refresh groups">
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="py-3">Group</th>
                <th>Approval</th>
                <th>Protection</th>
                <th>Threshold</th>
                <th>Daily report</th>
                <th>Scans</th>
                <th>Alerts</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {overview.groups.map((group) => {
                const saving = savingId === group.id
                return (
                  <tr key={group.id} className="border-t border-border">
                    <td className="py-4">
                      <p className="font-medium text-white">{group.title ?? "Unnamed group"}</p>
                      <p className="font-mono text-xs text-slate-500">{group.telegramChatId}</p>
                    </td>
                    <td>
                      <Button
                        type="button"
                        size="sm"
                        variant={group.allowlisted ? "default" : "outline"}
                        disabled={saving}
                        onClick={() => void updateGroup(group.id, { allowlisted: !group.allowlisted })}
                      >
                        {saving ? <Loader2 className="animate-spin" /> : null}
                        {group.allowlisted ? "Approved" : "Blocked"}
                      </Button>
                    </td>
                    <td>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => void updateGroup(group.id, { guardianEnabled: !group.guardianEnabled })}
                      >
                        {group.guardianEnabled ? "On" : "Off"}
                      </Button>
                    </td>
                    <td>
                      <select
                        aria-label={`Alert threshold for ${group.title ?? group.telegramChatId}`}
                        className="rounded-md border border-border bg-background px-2 py-2 text-xs text-white"
                        value={group.alertLevel}
                        disabled={saving}
                        onChange={(event) => void updateGroup(group.id, { alertLevel: event.target.value as AlertLevel })}
                      >
                        <option value="CAUTION">Caution</option>
                        <option value="HIGH_RISK">High risk</option>
                        <option value="CRITICAL">Critical</option>
                      </select>
                    </td>
                    <td>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => void updateGroup(group.id, { dailySummary: !group.dailySummary })}
                      >
                        {group.dailySummary ? "On" : "Off"}
                      </Button>
                    </td>
                    <td className="text-slate-200">{group.scanCount}</td>
                    <td className="text-yellow-200">{group.alertCount}</td>
                    <td className="text-xs text-slate-400">{new Date(group.lastSeenAt).toLocaleString()}</td>
                  </tr>
                )
              })}
              {!overview.groups.length && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
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
          <CardTitle className="text-white">Recent Guardian activity</CardTitle>
          <CardDescription className="text-slate-300">
            Latest private scans and community link checks, without storing raw transaction payloads.
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
          {!overview.recentScans.length && !loading && (
            <p className="py-8 text-center text-slate-400">No Telegram scan activity has been recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
