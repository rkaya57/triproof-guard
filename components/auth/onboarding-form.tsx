"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Copy, Loader2, Rocket, ShieldCheck, Sparkles, WalletCards } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { WalletAuthButtons } from "@/components/auth/wallet-auth-buttons"

type FieldErrors = Record<string, string[] | undefined>

const selectClass = "h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"

const workspaceBenefits = [
  "Prioritize the dashboard around your main security workflow.",
  "Keep optional project details separate from account credentials.",
  "Link a wallet with a signature only—no transfers or token approvals.",
] as const

export function OnboardingForm({
  next,
  referralCode,
}: {
  next: string
  referralCode?: string | null
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [walletMessage, setWalletMessage] = useState("")
  const [copied, setCopied] = useState(false)
  const referralPath = referralCode ? `/register?ref=${encodeURIComponent(referralCode)}` : ""

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError("")
    setFieldErrors({})
    const form = new FormData(event.currentTarget)
    const payload = Object.fromEntries(form.entries())
    try {
      const response = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = (await response.json().catch(() => null)) as {
        error?: string
        next?: string
        fieldErrors?: FieldErrors
      } | null
      if (!response.ok) {
        setError(body?.error || "Could not save onboarding details.")
        setFieldErrors(body?.fieldErrors || {})
        return
      }
      router.replace(next || body?.next || "/dashboard")
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  async function copyReferral() {
    if (!referralPath) return
    await navigator.clipboard.writeText(new URL(referralPath, window.location.origin).toString())
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <main className="premium-page security-grid min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/[0.065] bg-white/[0.018] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl border border-cyan-300/16 bg-cyan-300/[0.045]">
              <ShieldCheck className="size-5 text-cyan-300" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Tri-Proof Protocol</p>
              <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-cyan-200/55">Workspace setup</p>
            </div>
          </div>
          <Badge variant="outline" className="w-fit border-emerald-300/16 bg-emerald-300/[0.035] text-emerald-200">
            <CheckCircle2 className="mr-1 size-3.5" /> Account verified
          </Badge>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <Card className="glass-panel premium-card overflow-hidden border-white/[0.07]">
            <CardHeader className="border-b border-white/[0.055] bg-white/[0.012] p-6 sm:p-7">
              <Badge variant="outline" className="mb-3 w-fit border-cyan-300/18 bg-cyan-300/[0.04] text-cyan-100">
                <Rocket className="size-3.5" /> One-minute setup
              </Badge>
              <CardTitle className="text-3xl tracking-[-0.03em] text-white sm:text-4xl">Set up your workspace</CardTitle>
              <CardDescription className="max-w-2xl leading-6">
                Tell Tri-Proof which workflow matters most. Project details are optional and can be changed later from Settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 sm:p-7">
              <form onSubmit={submit} className="grid gap-6">
                <FieldGroup>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field data-invalid={Boolean(fieldErrors.accountRole?.length)}>
                      <FieldLabel htmlFor="accountRole">Your role</FieldLabel>
                      <select id="accountRole" name="accountRole" className={selectClass} defaultValue="FOUNDER" required>
                        <option value="FOUNDER">Project founder</option>
                        <option value="COMMUNITY_MANAGER">Community manager</option>
                        <option value="SECURITY_RESEARCHER">Security researcher</option>
                        <option value="DEVELOPER">Developer</option>
                        <option value="AIRDROP_PARTICIPANT">Airdrop participant</option>
                        <option value="OTHER">Other</option>
                      </select>
                      {fieldErrors.accountRole?.[0] && <FieldError>{fieldErrors.accountRole[0]}</FieldError>}
                    </Field>

                    <Field data-invalid={Boolean(fieldErrors.primaryUseCase?.length)}>
                      <FieldLabel htmlFor="primaryUseCase">Primary use case</FieldLabel>
                      <select id="primaryUseCase" name="primaryUseCase" className={selectClass} defaultValue="MULTIPLE" required>
                        <option value="SCAMGUARD">ScamGuard</option>
                        <option value="SYBIL_ANALYSIS">Sybil analysis</option>
                        <option value="TELEGRAM_GUARDIAN">Telegram Guardian</option>
                        <option value="API">Developer API</option>
                        <option value="MULTIPLE">Multiple products</option>
                      </select>
                      {fieldErrors.primaryUseCase?.[0] && <FieldError>{fieldErrors.primaryUseCase[0]}</FieldError>}
                    </Field>
                  </div>

                  <div className="my-1 border-t border-white/[0.055]" />

                  <div>
                    <p className="text-sm font-semibold text-white">Optional project profile</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Useful for campaign, partnership and community workflows. Skip this section if you are evaluating Tri-Proof personally.</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="projectName">Project name</FieldLabel>
                      <Input id="projectName" name="projectName" maxLength={120} placeholder="Project or workspace name" />
                    </Field>
                    <Field data-invalid={Boolean(fieldErrors.projectWebsite?.length)}>
                      <FieldLabel htmlFor="projectWebsite">Website</FieldLabel>
                      <Input id="projectWebsite" name="projectWebsite" type="url" placeholder="https://" maxLength={300} />
                      {fieldErrors.projectWebsite?.[0] && <FieldError>{fieldErrors.projectWebsite[0]}</FieldError>}
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="xHandle">X account</FieldLabel>
                      <Input id="xHandle" name="xHandle" placeholder="@project" maxLength={64} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="telegramHandle">Telegram</FieldLabel>
                      <Input id="telegramHandle" name="telegramHandle" placeholder="@project" maxLength={64} />
                    </Field>
                  </div>
                </FieldGroup>

                {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

                <div className="flex flex-col-reverse gap-2 border-t border-white/[0.055] pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <Button type="button" variant="ghost" onClick={() => router.replace(next || "/dashboard")}>Skip optional details</Button>
                  <Button type="submit" disabled={pending} className="glow-primary">
                    {pending && <Loader2 className="animate-spin" />}
                    Save and continue
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <aside className="grid content-start gap-4 lg:sticky lg:top-6">
            <Card className="glass-panel premium-card border-cyan-300/10">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl border border-cyan-300/14 bg-cyan-300/[0.04]"><Sparkles className="size-4 text-cyan-300" /></span>
                  <div><CardTitle className="text-base">Why we ask</CardTitle><CardDescription>Only enough context to tailor the workspace.</CardDescription></div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                {workspaceBenefits.map((item) => (
                  <div key={item} className="flex gap-2.5 text-xs leading-5 text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-300" />
                    <span>{item}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="glass-panel premium-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-white"><WalletCards className="size-4 text-primary" /> Link a wallet</CardTitle>
                <CardDescription>Optional. Prove ownership with a signature; no funds move and no token approvals are granted.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <WalletAuthButtons
                  purpose="LINK"
                  onComplete={() => setWalletMessage("Wallet linked successfully.")}
                  onError={setWalletMessage}
                />
                {walletMessage && <Alert><AlertDescription>{walletMessage}</AlertDescription></Alert>}
              </CardContent>
            </Card>

            {referralCode && (
              <Card className="glass-panel premium-card">
                <CardHeader>
                  <CardTitle className="text-base text-white">Your referral link</CardTitle>
                  <CardDescription>Share this link to attribute new account registrations to you.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <code className="overflow-hidden text-ellipsis rounded-xl border border-border bg-background/60 p-3 text-xs text-primary">{referralPath}</code>
                  <Button type="button" variant="outline" onClick={copyReferral}>
                    {copied ? <CheckCircle2 /> : <Copy />}
                    {copied ? "Copied" : "Copy referral link"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </main>
  )
}
