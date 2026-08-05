import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { OnboardingForm } from "@/components/auth/onboarding-form"
import { safePostAuthPath } from "@/lib/auth/redirects"
import { getCurrentUser } from "@/lib/auth/session"

export const metadata: Metadata = {
  title: "Set up workspace | Tri-Proof Protocol",
  description: "Choose your Tri-Proof role, products, and optional project profile.",
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const params = await searchParams
  const next = safePostAuthPath(params.next)
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/onboarding?next=${encodeURIComponent(next)}`)}`)
  if (!user.emailVerifiedAt) redirect(`/verify-email?email=${encodeURIComponent(user.email)}&next=${encodeURIComponent(next)}`)
  if (user.onboardingCompletedAt) redirect(next)

  return <OnboardingForm next={next} referralCode={user.referralCode} />
}
