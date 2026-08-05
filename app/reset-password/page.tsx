import type { Metadata } from "next"

import { AuthShell } from "@/components/auth/auth-shell"
import { ResetPasswordForm } from "@/components/auth/recovery-forms"

export const metadata: Metadata = {
  title: "Reset password | Tri-Proof Protocol",
  description: "Choose a new password for your Tri-Proof Protocol account.",
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>
}) {
  const params = await searchParams
  const token = typeof params.token === "string" ? params.token : ""
  return (
    <AuthShell>
      <ResetPasswordForm token={token} />
    </AuthShell>
  )
}
