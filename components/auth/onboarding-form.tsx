"use client"

import { FormEvent, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Copy, Loader2, Rocket, ShieldCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { WalletAuthButtons } from "@/components/auth/wallet-auth-buttons"

type FieldErrors = Record<string, string[] | undefined>

const selectClass = "h-10 w-full rounded-lg border border-input bg-background/70 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"

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
  const referralUrl = useMemo(() => {
    if (!referralCode || typeof window === "undefined") return ""
    return `${window.location.origin}/register?ref=${encodeURIComponent(referralCode)}`
  }, [referralCode])

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
    if (!referralUrl) return
    await navigator.clipboard.writeText(referralUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <main className="security-grid min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_0.72fr]">
        <Card className="glass-panel premium-card">
          <CardHeader>
            <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Rocket /></div>
            <CardTitle className="text-3xl text-white">Set up your workspace</CardTitle>
            <CardDescription className="max-w-2xl leading-6">
              Keep registration short, then tailor the dashboard to your role and primary Tri-Proof workflow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-5">
              <FieldGroup>
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="projectName">Project name <span className="text-muted-foreground">(optional)</span></FieldLabel>
                    <Input id="projectName" name="projectName" maxLength={120} />
                  </Field>
                  <Field data-invalid={Boolean(fieldErrors.projectWebsite?.length)}>
                    <FieldLabel htmlFor="projectWebsite">Website <span className="text-muted-foreground">(optional)</span></FieldLabel>
                    <Input id="projectWebsite" name="projectWebsite" type="url" placeholder="https://" maxLength={300} />
                    {fieldErrors.projectWebsite?.[0] && <FieldError>{fieldErrors.projectWebsite[0]}</FieldError>}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="xHandle">X account <span className="text-muted-foreground">(optional)</span></FieldLabel>
                    <Input id="xHandle" name="xHandle" placeholder="@project" maxLength={64} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="telegramHandle">Telegram <span className="text-muted-foreground">(optional)</span></FieldLabel>
                    <Input id="telegramHandle" name="telegramHandle" placeholder="@project" maxLength={64} />
                  </Field>
                </div>
              </FieldGroup>

              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={() => router.replace(next || "/dashboard")}>Skip optional details</Button>
                <Button type="submit" disabled={pending} className="glow-primary">
                  {pending && <Loader2 className="animate-spin" />}
                  Save and continue
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card className="glass-panel premium-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white"><ShieldCheck className="text-primary" /> Link a wallet</CardTitle>
              <CardDescription>Optional. A wallet signature links ownership without moving funds or granting token approvals.</CardDescription>
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
                <CardTitle className="text-white">Your referral link</CardTitle>
                <CardDescription>Share this link to attribute new account registrations to you.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <code className="overflow-hidden text-ellipsis rounded-lg border border-border bg-background/60 p-3 text-xs text-primary">{referralUrl || referralCode}</code>
                <Button type="button" variant="outline" onClick={copyReferral}>
                  {copied ? <CheckCircle2 /> : <Copy />}
                  {copied ? "Copied" : "Copy referral link"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </main>
  )
}
