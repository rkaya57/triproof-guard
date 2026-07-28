import { AuthForm } from "@/components/auth/auth-form"
import { safePostAuthPath } from "@/lib/auth/redirects"
import { getCurrentUser } from "@/lib/auth/session"
import { redirect } from "next/navigation"

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams
  const redirectTo = safePostAuthPath(params.next)

  if (await getCurrentUser()) redirect(redirectTo)

  return <AuthForm mode="register" redirectTo={redirectTo} />
}
