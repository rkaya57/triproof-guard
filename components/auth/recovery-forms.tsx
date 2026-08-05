"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useEffect, useState } from "react"
import { CheckCircle2, Eye, EyeOff, Loader2, MailCheck } from "lucide-react"

import { Turnstile } from "@/components/auth/turnstile"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const result = (await response.json().catch(() => null)) as {
    error?: string
    message?: string
    next?: string
    fieldErrors?: Record<string, string[] | undefined>
  } | null
  return { response, result }
}

export function ForgotPasswordForm({ siteKey }: { siteKey?: string | null }) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError("")
    const form = new FormData(event.currentTarget)
    try {
      const { response, result } = await postJson("/api/auth/forgot-password", {
        email: String(form.get("email") ?? ""),
        turnstileToken,
      })
      if (!response.ok) setError(result?.error || "Could not start password recovery.")
      else setMessage(result?.message || "Check your email for a password reset link.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="mb-2 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><MailCheck /></div>
        <CardTitle className="text-2xl text-white">Reset your password</CardTitle>
        <CardDescription>Enter your account email. The response will be the same whether or not an account exists.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {message ? (
          <Alert className="border-emerald-400/30 bg-emerald-400/10 text-emerald-100">
            <CheckCircle2 />
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={submit} className="grid gap-5">
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
            </Field>
            <Turnstile siteKey={siteKey} onToken={setTurnstileToken} />
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Send reset link
            </Button>
          </form>
        )}
        <Link href="/login" className="text-center text-sm text-primary hover:underline">Back to sign in</Link>
      </CardContent>
    </Card>
  )
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({})
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError("")
    setFieldErrors({})
    const form = new FormData(event.currentTarget)
    try {
      const { response, result } = await postJson("/api/auth/reset-password", {
        token,
        password: String(form.get("password") ?? ""),
        confirmPassword: String(form.get("confirmPassword") ?? ""),
      })
      if (!response.ok) {
        setError(result?.error || "Password reset failed.")
        setFieldErrors(result?.fieldErrors || {})
        return
      }
      router.replace(result?.next || "/login?reset=success")
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="text-2xl text-white">Choose a new password</CardTitle>
        <CardDescription>The link is single-use. Completing this step signs your account out on every device.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-5">
          <FieldGroup>
            <Field data-invalid={Boolean(fieldErrors.password?.length)}>
              <FieldLabel htmlFor="password">New password</FieldLabel>
              <div className="relative">
                <Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={10} maxLength={128} required className="pr-10" />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground" aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {fieldErrors.password?.[0] && <FieldError>{fieldErrors.password[0]}</FieldError>}
            </Field>
            <Field data-invalid={Boolean(fieldErrors.confirmPassword?.length)}>
              <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
              <div className="relative">
                <Input id="confirmPassword" name="confirmPassword" type={showConfirmation ? "text" : "password"} autoComplete="new-password" minLength={10} maxLength={128} required className="pr-10" />
                <button type="button" onClick={() => setShowConfirmation((value) => !value)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground" aria-label={showConfirmation ? "Hide confirmation" : "Show confirmation"}>
                  {showConfirmation ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {fieldErrors.confirmPassword?.[0] && <FieldError>{fieldErrors.confirmPassword[0]}</FieldError>}
            </Field>
          </FieldGroup>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <Button type="submit" disabled={pending || !token}>
            {pending && <Loader2 className="animate-spin" />}
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function VerifyEmailForm({
  token,
  email,
  next,
  sent,
  siteKey,
}: {
  token?: string
  email?: string
  next: string
  sent: boolean
  siteKey?: string | null
}) {
  const router = useRouter()
  const [pending, setPending] = useState(Boolean(token))
  const [error, setError] = useState("")
  const [message, setMessage] = useState(sent ? "A verification link was sent to your email." : "")
  const [resending, setResending] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    postJson("/api/auth/verify-email", { token, remember: true })
      .then(({ response, result }) => {
        if (cancelled) return
        if (!response.ok) setError(result?.error || "Email verification failed.")
        else {
          router.replace(result?.next?.startsWith("/onboarding")
            ? `/onboarding?next=${encodeURIComponent(next)}`
            : result?.next || next)
          router.refresh()
        }
      })
      .finally(() => {
        if (!cancelled) setPending(false)
      })
    return () => { cancelled = true }
  }, [next, router, token])

  async function resend() {
    if (!email) return
    setResending(true)
    setError("")
    const { response, result } = await postJson("/api/auth/resend-verification", {
      email,
      turnstileToken,
    })
    if (response.ok) setMessage(result?.message || "Verification email sent.")
    else setError(result?.error || "Could not resend the verification email.")
    setResending(false)
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="mb-2 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><MailCheck /></div>
        <CardTitle className="text-2xl text-white">Verify your email</CardTitle>
        <CardDescription>Verification protects account recovery, payments, API keys, and reward-related activity.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {pending && <div className="flex items-center gap-3 rounded-xl border border-border p-4 text-sm text-muted-foreground"><Loader2 className="animate-spin text-primary" /> Verifying your secure link…</div>}
        {message && <Alert className="border-primary/30 bg-primary/10"><AlertDescription>{message}</AlertDescription></Alert>}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {!token && email && (
          <div className="grid gap-3">
            <Turnstile siteKey={siteKey} onToken={setTurnstileToken} />
            <Button type="button" variant="outline" disabled={resending} onClick={resend}>
              {resending && <Loader2 className="animate-spin" />}
              Resend verification email
            </Button>
          </div>
        )}
        <Link href="/login" className="text-center text-sm text-primary hover:underline">Back to sign in</Link>
      </CardContent>
    </Card>
  )
}
