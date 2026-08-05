import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuthForm } from "@/components/auth/auth-form"
import { AuthShell } from "@/components/auth/auth-shell"
import { configuredOAuthProviders } from "@/lib/auth/oauth"
import { safePostAuthPath } from "@/lib/auth/redirects"
import { getCurrentUser } from "@/lib/auth/session"

export const metadata: Metadata = {
  title: "Create account | Tri-Proof Protocol",
  description: "Create a secure Tri-Proof Protocol workspace account.",
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[]
    ref?: string | string[]
    oauth_error?: string | string[]
  }>
}) {
  const params = await searchParams
  const redirectTo = safePostAuthPath(params.next)
  const user = await getCurrentUser()
  if (user) {
    redirect(user.onboardingCompletedAt ? redirectTo : `/onboarding?next=${encodeURIComponent(redirectTo)}`)
  }

  const referralCode = typeof params.ref === "string" ? params.ref.slice(0, 32) : ""
  const oauthError = typeof params.oauth_error === "string" ? params.oauth_error.slice(0, 300) : ""
  return (
    <AuthShell>
      <AuthForm
        mode="register"
        redirectTo={redirectTo}
        oauthProviders={configuredOAuthProviders()}
        turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null}
        referralCode={referralCode}
        initialError={oauthError}
      />
    </AuthShell>
  )
}
