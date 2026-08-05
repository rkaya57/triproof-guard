"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Turnstile } from "@/components/auth/turnstile"
import { WalletAuthButtons } from "@/components/auth/wallet-auth-buttons"

type OAuthProvider = "google" | "discord"

type AuthFormProps = {
  mode: "login" | "register"
  redirectTo: string
  oauthProviders?: OAuthProvider[]
  turnstileSiteKey?: string | null
  referralCode?: string
  initialError?: string
  resetSucceeded?: boolean
}

type FieldErrors = Record<string, string[] | undefined>

function passwordStrength(password: string) {
  let score = 0
  if (password.length >= 10) score += 1
  if (password.length >= 14) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^a-zA-Z0-9]/.test(password)) score += 1
  return Math.min(4, score)
}

function passwordStrengthLabel(score: number) {
  return ["Very weak", "Weak", "Fair", "Strong", "Very strong"][score]
}

function OAuthMark({ provider }: { provider: OAuthProvider }) {
  return (
    <span className="flex size-5 items-center justify-center rounded bg-background font-bold uppercase">
      {provider === "google" ? "G" : "D"}
    </span>
  )
}

export function AuthForm({
  mode,
  redirectTo,
  oauthProviders = [],
  turnstileSiteKey,
  referralCode = "",
  initialError = "",
  resetSucceeded = false,
}: AuthFormProps) {
  const router = useRouter()
  const [error, setError] = useState(initialError)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [pending, setPending] = useState(false)
  const [resending, setResending] = useState(false)
  const [unverifiedEmail, setUnverifiedEmail] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [password, setPassword] = useState("")
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const [remember, setRemember] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const isRegister = mode === "register"
  const strength = useMemo(() => passwordStrength(password), [password])

  function destination(next?: string | null) {
    if (next?.startsWith("/onboarding")) {
      const target = new URL(next, window.location.origin)
      if (!target.searchParams.has("next")) target.searchParams.set("next", redirectTo)
      return `${target.pathname}${target.search}`
    }
    return next || redirectTo
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError("")
    setFieldErrors({})
    setUnverifiedEmail("")

    const form = new FormData(event.currentTarget)
    const payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      confirmPassword: String(form.get("confirmPassword") ?? ""),
      acceptTerms,
      acceptPrivacy,
      referralCode,
      remember,
      turnstileToken,
    }

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRegister
            ? payload
            : {
                email: payload.email,
                password: payload.password,
                remember,
                turnstileToken,
              }
        ),
      })
      const body = (await response.json().catch(() => null)) as
        | {
            error?: string
            code?: string
            email?: string
            next?: string | null
            verificationRequired?: boolean
            emailDelivered?: boolean
            fieldErrors?: FieldErrors
          }
        | null

      if (!response.ok) {
        setError(body?.error ?? "Authentication failed")
        setFieldErrors(body?.fieldErrors ?? {})
        if (body?.code === "EMAIL_NOT_VERIFIED" && body.email) setUnverifiedEmail(body.email)
        return
      }

      if (body?.verificationRequired) {
        const target = new URL("/verify-email", window.location.origin)
        target.searchParams.set("email", body.email || payload.email)
        target.searchParams.set("sent", String(Boolean(body.emailDelivered)))
        target.searchParams.set("next", redirectTo)
        router.replace(`${target.pathname}${target.search}`)
        return
      }

      router.replace(destination(body?.next))
      router.refresh()
    } catch {
      setError("Could not reach Tri-Proof Protocol. Check your connection and try again.")
    } finally {
      setPending(false)
    }
  }

  async function resendVerification() {
    if (!unverifiedEmail || resending) return
    setResending(true)
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: unverifiedEmail, turnstileToken }),
      })
      const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null
      setError(response.ok ? body?.message || "Verification email sent." : body?.error || "Could not resend verification.")
    } finally {
      setResending(false)
    }
  }

  function startOAuth(provider: OAuthProvider) {
    if (isRegister && (!acceptTerms || !acceptPrivacy)) {
      setError("Accept the Terms and Privacy Policy before creating an account with a provider.")
      return
    }
    const url = new URL(`/api/auth/oauth/${provider}/start`, window.location.origin)
    url.searchParams.set("intent", mode)
    url.searchParams.set("next", redirectTo)
    if (isRegister) url.searchParams.set("terms", "true")
    window.location.assign(`${url.pathname}${url.search}`)
  }

  return (
    <Card className="glass-panel border-border/80 shadow-2xl">
      <CardHeader className="gap-3 pb-2">
        <div className="flex size-11 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
          <LockKeyhole className="size-5" />
        </div>
        <div>
          <CardTitle className="text-2xl text-white">
            {isRegister ? "Create a secure account" : "Welcome back"}
          </CardTitle>
          <CardDescription className="mt-2 leading-6">
            {isRegister
              ? "Create your workspace account, verify your email, then choose the Tri-Proof tools you need."
              : "Sign in to continue wallet review, ScamGuard, and Telegram Guardian operations."}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="grid gap-5 pt-4">
        {resetSucceeded && (
          <Alert className="border-emerald-400/30 bg-emerald-400/10 text-emerald-100">
            <CheckCircle2 />
            <AlertDescription>Your password was updated. Sign in with the new password.</AlertDescription>
          </Alert>
        )}

        {oauthProviders.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {oauthProviders.map((provider) => (
              <Button key={provider} type="button" variant="outline" onClick={() => startOAuth(provider)}>
                <OAuthMark provider={provider} />
                Continue with {provider === "google" ? "Google" : "Discord"}
              </Button>
            ))}
          </div>
        )}

        {oauthProviders.length > 0 && (
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or use email
            <span className="h-px flex-1 bg-border" />
          </div>
        )}

        <form onSubmit={onSubmit} className="grid gap-5" noValidate>
          <FieldGroup>
            {isRegister && (
              <Field data-invalid={Boolean(fieldErrors.name?.length)}>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input id="name" name="name" autoComplete="name" maxLength={80} required aria-invalid={Boolean(fieldErrors.name?.length)} />
                {fieldErrors.name?.[0] && <FieldError>{fieldErrors.name[0]}</FieldError>}
              </Field>
            )}

            <Field data-invalid={Boolean(fieldErrors.email?.length)}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" maxLength={254} required aria-invalid={Boolean(fieldErrors.email?.length)} />
              {fieldErrors.email?.[0] && <FieldError>{fieldErrors.email[0]}</FieldError>}
            </Field>

            <Field data-invalid={Boolean(fieldErrors.password?.length)}>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                {!isRegister && (
                  <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                    Forgot password?
                  </Link>
                )}
              </div>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  minLength={isRegister ? 10 : 1}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
                  aria-invalid={Boolean(fieldErrors.password?.length)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-white"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {capsLock && <FieldDescription className="text-amber-200">Caps Lock is on.</FieldDescription>}
              {fieldErrors.password?.[0] && <FieldError>{fieldErrors.password[0]}</FieldError>}

              {isRegister && (
                <div className="grid gap-2">
                  <div className="grid grid-cols-4 gap-1" aria-label={`Password strength: ${passwordStrengthLabel(strength)}`}>
                    {[1, 2, 3, 4].map((level) => (
                      <span key={level} className={`h-1.5 rounded-full ${strength >= level ? "bg-primary" : "bg-border"}`} />
                    ))}
                  </div>
                  <FieldDescription>{passwordStrengthLabel(strength)} · use 10+ characters with letters and numbers.</FieldDescription>
                </div>
              )}
            </Field>

            {isRegister && (
              <Field data-invalid={Boolean(fieldErrors.confirmPassword?.length)}>
                <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={10}
                    maxLength={128}
                    required
                    aria-invalid={Boolean(fieldErrors.confirmPassword?.length)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-white"
                    aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
                  >
                    {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {fieldErrors.confirmPassword?.[0] && <FieldError>{fieldErrors.confirmPassword[0]}</FieldError>}
              </Field>
            )}
          </FieldGroup>

          {isRegister ? (
            <div className="grid gap-3 rounded-xl border border-border/75 bg-background/45 p-4 text-sm">
              <label className="flex items-start gap-3">
                <input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} className="mt-1 size-4 accent-primary" />
                <span>I accept the <Link href="/terms" target="_blank" className="text-primary hover:underline">Terms of Service</Link>.</span>
              </label>
              <label className="flex items-start gap-3">
                <input type="checkbox" checked={acceptPrivacy} onChange={(event) => setAcceptPrivacy(event.target.checked)} className="mt-1 size-4 accent-primary" />
                <span>I have read the <Link href="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</Link>.</span>
              </label>
              {(fieldErrors.acceptTerms?.[0] || fieldErrors.acceptPrivacy?.[0]) && (
                <p className="text-xs text-destructive">Terms and privacy acceptance are required.</p>
              )}
            </div>
          ) : (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="size-4 accent-primary" />
              Keep me signed in on this device for 30 days
            </label>
          )}

          <Turnstile siteKey={turnstileSiteKey} onToken={setTurnstileToken} />

          {error && (
            <Alert variant={error.includes("sent") ? "default" : "destructive"}>
              <AlertTriangle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {unverifiedEmail && (
            <Button type="button" variant="outline" disabled={resending} onClick={resendVerification}>
              {resending && <Loader2 className="animate-spin" />}
              Resend verification email
            </Button>
          )}

          <Button type="submit" disabled={pending || (isRegister && (!acceptTerms || !acceptPrivacy))} className="h-10 glow-primary">
            {pending && <Loader2 data-icon="inline-start" className="animate-spin" />}
            {isRegister ? "Create Account" : "Sign In"}
          </Button>
        </form>

        {!isRegister && (
          <div className="grid gap-3">
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              linked wallet
              <span className="h-px flex-1 bg-border" />
            </div>
            <WalletAuthButtons
              purpose="LOGIN"
              redirectTo={redirectTo}
              remember={remember}
              onComplete={(result) => {
                router.replace(destination(result.next))
                router.refresh()
              }}
              onError={setError}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-border/70 pt-4 text-sm text-muted-foreground">
          <span>{isRegister ? "Already have an account?" : "New to Tri-Proof?"}</span>
          <Link
            href={`${isRegister ? "/login" : "/register"}?next=${encodeURIComponent(redirectTo)}${referralCode ? `&ref=${encodeURIComponent(referralCode)}` : ""}`}
            className={buttonVariants({ variant: "link" })}
          >
            {isRegister ? "Sign in" : "Create account"}
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
