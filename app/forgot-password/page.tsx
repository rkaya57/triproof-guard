import type { Metadata } from "next"

import { AuthShell } from "@/components/auth/auth-shell"
import { ForgotPasswordForm } from "@/components/auth/recovery-forms"

export const metadata: Metadata = {
  title: "Forgot password | Tri-Proof Protocol",
  description: "Securely recover access to your Tri-Proof Protocol account.",
}

export default function Page() {
  return (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  )
}
