"use client"

import { FormEvent, useState } from "react"
import { CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type FieldErrors = Record<string, string[] | undefined>

function PasswordInput({
  id,
  name,
  label,
  autoComplete,
  error,
}: {
  id: string
  name: string
  label: string
  autoComplete: string
  error?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={name === "currentPassword" ? 1 : 10}
          maxLength={128}
          required
          className="pr-10"
          aria-invalid={Boolean(error)}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-white"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

export function ChangePasswordCard() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError("")
    setMessage("")
    setFieldErrors({})
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: String(form.get("currentPassword") ?? ""),
          password: String(form.get("password") ?? ""),
          confirmPassword: String(form.get("confirmPassword") ?? ""),
        }),
      })
      const body = (await response.json().catch(() => null)) as {
        error?: string
        fieldErrors?: FieldErrors
      } | null
      if (!response.ok) {
        setError(body?.error || "Could not update your password.")
        setFieldErrors(body?.fieldErrors || {})
        return
      }
      formElement.reset()
      setMessage("Password updated. All previous device sessions were revoked.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="glass-panel premium-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <LockKeyhole className="text-primary" /> Change password
        </CardTitle>
        <CardDescription>
          Changing your password revokes every existing session and creates a fresh session for this device.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-5">
          <FieldGroup>
            <PasswordInput
              id="currentPassword"
              name="currentPassword"
              label="Current password"
              autoComplete="current-password"
              error={fieldErrors.currentPassword?.[0]}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <PasswordInput
                id="newPassword"
                name="password"
                label="New password"
                autoComplete="new-password"
                error={fieldErrors.password?.[0]}
              />
              <PasswordInput
                id="confirmNewPassword"
                name="confirmPassword"
                label="Confirm new password"
                autoComplete="new-password"
                error={fieldErrors.confirmPassword?.[0]}
              />
            </div>
          </FieldGroup>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {message && (
            <Alert className="border-emerald-400/30 bg-emerald-400/10 text-emerald-100">
              <CheckCircle2 />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Update password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
