import type { Metadata } from "next"

import { AuthShell } from "@/components/auth/auth-shell"
import { VerifyEmailForm } from "@/components/auth/recovery-forms"
import { safePostAuthPath } from "@/lib/auth/redirects"

export const metadata: Metadata = {
  title: "Verify email | Tri-Proof Protocol",
  description: "Verify your email to secure your Tri-Proof Protocol account.",
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string | string[]
    email?: string | string[]
    next?: string | string[]
    sent?: string | string[]
  }>
}) {
  const params = await searchParams
  return (
    <AuthShell>
      <VerifyEmailForm
        token={typeof params.token === "string" ? params.token : undefined}
        email={typeof params.email === "string" ? params.email : undefined}
        next={safePostAuthPath(params.next)}
        sent={params.sent === "true"}
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null}
      />
    </AuthShell>
  )
}
