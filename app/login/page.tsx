import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuthForm } from "@/components/auth/auth-form"
import { AuthShell } from "@/components/auth/auth-shell"
import { configuredOAuthProviders } from "@/lib/auth/oauth"
import { safePostAuthPath } from "@/lib/auth/redirects"
import { getCurrentUser } from "@/lib/auth/session"

export const metadata: Metadata = {
  title: "Sign in | Tri-Proof Protocol",
  description: "Securely access your Tri-Proof Protocol workspace.",
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[]
    oauth_error?: string | string[]
    reset?: string | string[]
  }>
}) {
  const params = await searchParams
  const redirectTo = safePostAuthPath(params.next)
  const user = await getCurrentUser()
  if (user) {
    redirect(user.onboardingCompletedAt ? redirectTo : `/onboarding?next=${encodeURIComponent(redirectTo)}`)
  }

  const oauthError = typeof params.oauth_error === "string" ? params.oauth_error.slice(0, 300) : ""
  return (
    <AuthShell>
      <AuthForm
        mode="login"
        redirectTo={redirectTo}
        oauthProviders={configuredOAuthProviders()}
        turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null}
        initialError={oauthError}
        resetSucceeded={params.reset === "success"}
      />
    </AuthShell>
  )
}
