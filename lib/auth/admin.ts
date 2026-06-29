import { getCurrentUser } from "@/lib/auth/session"

export function getAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email: string | null | undefined) {
  if (!email) return false
  return getAdminEmails().includes(email.toLowerCase())
}

export async function getAdminUser() {
  const user = await getCurrentUser()
  if (!user || !isAdminEmail(user.email)) return null
  return user
}

export async function requireAdminUser() {
  const user = await getAdminUser()
  if (!user) throw new Error("Admin access required")
  return user
}
