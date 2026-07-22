"use client"

import { useEffect, useMemo, useState } from "react"
import {
  BellRing,
  Download,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Webhook,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type SettingsState = {
  defaultChain: string
  riskPolicy: string
  analysisMode: string
  grayZoneThreshold: number
  exportCsv: boolean
  exportPdf: boolean
  includeReasonCodes: boolean
  includeProviderEvidence: boolean
  webhookUrl: string
  alertEmail: string
  requireSecondReviewer: boolean
  inviteRole: string
}

const storageKey = "triproof-dashboard-settings:v1"

const defaults: SettingsState = {
  defaultChain: "Solana",
  riskPolicy: "balanced",
  analysisMode: "onchain",
  grayZoneThreshold: 60,
  exportCsv: true,
  exportPdf: true,
  includeReasonCodes: true,
  includeProviderEvidence: true,
  webhookUrl: "",
  alertEmail: "",
  requireSecondReviewer: true,
  inviteRole: "reviewer",
}

function FieldLabel({ title, description }: { title: string; description: string }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-white">{title}</span>
      <span className="text-xs leading-5 text-muted-foreground">{description}</span>
    </label>
  )
}

function NativeSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-white outline-none focus:border-primary"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/45 p-3">
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-primary"
      />
    </label>
  )
}

export function SettingsClient() {
  const [settings, setSettings] = useState<SettingsState>(defaults)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(storageKey)
      if (!saved) return
      try {
        setSettings({ ...defaults, ...JSON.parse(saved) })
      } catch {
        window.localStorage.removeItem(storageKey)
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const policyBadge = useMemo(() => {
    if (settings.riskPolicy === "strict") return "High-value campaign protection"
    if (settings.riskPolicy === "conservative") return "Reviewer-friendly approvals"
    return "Balanced default"
  }, [settings.riskPolicy])

  function update<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  function save() {
    window.localStorage.setItem(storageKey, JSON.stringify(settings))
    setSavedAt(new Date().toLocaleTimeString())
  }

  function reset() {
    setSettings(defaults)
    window.localStorage.removeItem(storageKey)
    setSavedAt(null)
  }

  return (
    <div className="grid gap-5">
      <Card className="glass-panel premium-card animated-border">
        <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <SlidersHorizontal className="text-primary" />
              Workspace Controls
            </CardTitle>
            <CardDescription>
              Save operator defaults for analysis creation, exports and review handoff on this device.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={reset}>
              <RotateCcw data-icon="inline-start" />
              Reset
            </Button>
            <Button type="button" onClick={save} className="glow-primary">
              <Save data-icon="inline-start" />
              Save preferences
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary" className="border-primary/30 text-primary">{policyBadge}</Badge>
          <Badge variant="outline">{settings.defaultChain}</Badge>
          <Badge variant="outline">{settings.analysisMode}</Badge>
          {savedAt && <span>Saved at {savedAt}</span>}
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <ShieldCheck className="text-primary" />
              Risk policy defaults
            </CardTitle>
            <CardDescription>Used as the preferred setup when operators create a new campaign.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
              <FieldLabel title="Default chain" description="Preselect the most common campaign network." />
              <NativeSelect
                value={settings.defaultChain}
                onChange={(value) => update("defaultChain", value)}
                options={[
                  { value: "Solana", label: "Solana" },
                  { value: "Base", label: "Base" },
                  { value: "Ethereum", label: "Ethereum" },
                  { value: "Polygon", label: "Polygon" },
                ]}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
              <FieldLabel title="Risk policy" description="Controls how aggressively Gray Zone and rejection thresholds are suggested." />
              <NativeSelect
                value={settings.riskPolicy}
                onChange={(value) => update("riskPolicy", value)}
                options={[
                  { value: "balanced", label: "Balanced" },
                  { value: "conservative", label: "Conservative" },
                  { value: "strict", label: "Strict" },
                ]}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
              <FieldLabel title="Analysis mode" description="Prefer real on-chain data, hybrid mode or CSV-only triage." />
              <NativeSelect
                value={settings.analysisMode}
                onChange={(value) => update("analysisMode", value)}
                options={[
                  { value: "onchain", label: "On-chain" },
                  { value: "hybrid", label: "Hybrid" },
                  { value: "csv_only", label: "CSV only" },
                ]}
              />
            </div>
            <div className="grid gap-2 rounded-lg border border-border bg-background/45 p-4">
              <div className="flex items-center justify-between gap-3">
                <FieldLabel title="Gray Zone threshold" description="Score where review becomes mandatory for ambiguous wallets." />
                <span className="font-mono text-primary">{settings.grayZoneThreshold}</span>
              </div>
              <input
                type="range"
                min={35}
                max={85}
                value={settings.grayZoneThreshold}
                onChange={(event) => update("grayZoneThreshold", Number(event.target.value))}
                className="w-full accent-primary"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Download className="text-primary" />
              Export defaults
            </CardTitle>
            <CardDescription>Keep report packages consistent across airdrops, testnets and quests.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ToggleRow label="CSV exports" description="Clean list, Gray Zone and rejected/not-eligible files." checked={settings.exportCsv} onChange={(value) => update("exportCsv", value)} />
            <ToggleRow label="PDF report" description="Decision summary, proof ID and methodology notes." checked={settings.exportPdf} onChange={(value) => update("exportPdf", value)} />
            <ToggleRow label="Reason codes" description="Include explainable risk codes in operator exports." checked={settings.includeReasonCodes} onChange={(value) => update("includeReasonCodes", value)} />
            <ToggleRow label="Provider evidence" description="Include enrichment provider and coverage metadata." checked={settings.includeProviderEvidence} onChange={(value) => update("includeProviderEvidence", value)} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Webhook className="text-primary" />
              Webhook handoff
            </CardTitle>
            <CardDescription>Store the target endpoint and alert recipient for completed analyses.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="grid gap-2 text-sm text-slate-300">
              Webhook URL
              <Input value={settings.webhookUrl} onChange={(event) => update("webhookUrl", event.target.value)} placeholder="https://example.com/api/triproof" />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              Alert email
              <Input value={settings.alertEmail} onChange={(event) => update("alertEmail", event.target.value)} placeholder="ops@example.com" />
            </label>
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Users className="text-primary" />
              Team access
            </CardTitle>
            <CardDescription>Prepare reviewer behavior for Gray Zone-heavy campaigns.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ToggleRow label="Second reviewer required" description="Flag high-risk Gray Zone wallets for another reviewer." checked={settings.requireSecondReviewer} onChange={(value) => update("requireSecondReviewer", value)} />
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
              <FieldLabel title="Default invite role" description="Role used for future team invitations." />
              <NativeSelect
                value={settings.inviteRole}
                onChange={(value) => update("inviteRole", value)}
                options={[
                  { value: "reviewer", label: "Reviewer" },
                  { value: "operator", label: "Operator" },
                  { value: "admin", label: "Admin" },
                ]}
              />
            </div>
            <div className={cn("rounded-lg border p-4 text-sm", settings.requireSecondReviewer ? "border-amber-400/25 bg-amber-400/10 text-amber-100" : "border-border bg-background/45 text-muted-foreground")}>
              <BellRing className="mb-2 size-4" />
              High-risk Gray Zone wallets will be surfaced for additional review in the report workflow.
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
