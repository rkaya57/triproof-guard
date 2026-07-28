"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"
import Image from "next/image"
import { Loader2 } from "lucide-react"

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

type AuthFormProps = {
  mode: "login" | "register"
  redirectTo: string
}

export function AuthForm({ mode, redirectTo }: AuthFormProps) {
  const router = useRouter()
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const isRegister = mode === "register"

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError("")

    const form = new FormData(event.currentTarget)
    const payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    }

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isRegister ? payload : { email: payload.email, password: payload.password }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? "Authentication failed")
        return
      }

      router.replace(redirectTo)
      router.refresh()
    } catch {
      setError("Could not reach Tri-Proof Guard. Check your connection and try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="security-grid flex min-h-screen items-center justify-center px-5 py-12">
      <Card className="glass-panel w-full max-w-md">
        <CardHeader className="gap-4">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo.svg"
              alt="Tri-Proof Guard"
              width={36}
              height={36}
              priority
              className="rounded-lg"
            />
            <span className="text-sm font-semibold">Tri-Proof Guard</span>
          </Link>
          <div className="flex flex-col gap-2">
            <CardTitle>{isRegister ? "Create your account" : "Welcome back"}</CardTitle>
            <CardDescription>
              {isRegister
                ? "Start wallet risk analysis for your campaign."
                : "Sign in to continue your campaign review."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <FieldGroup>
              {isRegister && (
                <Field>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <Input id="name" name="name" autoComplete="name" required />
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  minLength={8}
                  required
                />
                <FieldDescription>Use at least 8 characters.</FieldDescription>
              </Field>
            </FieldGroup>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={pending}>
              {pending && <Loader2 data-icon="inline-start" className="animate-spin" />}
              {isRegister ? "Create Account" : "Login"}
            </Button>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{isRegister ? "Already have an account?" : "Need an account?"}</span>
              <Link
                href={`${isRegister ? "/login" : "/register"}?next=${encodeURIComponent(redirectTo)}`}
                className={buttonVariants({ variant: "link" })}
              >
                {isRegister ? "Login" : "Register"}
              </Link>
            </div>
            <FieldError />
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
