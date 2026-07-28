import { redirect } from "next/navigation"

import { loginPathFor } from "@/lib/auth/redirects"
import { getCurrentUser } from "@/lib/auth/session"

export async function requirePageUser(nextPath: string) {
  const user = await getCurrentUser()
  if (!user) redirect(loginPathFor(nextPath))
  return user
}
