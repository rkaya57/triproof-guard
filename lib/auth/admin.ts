import { getCurrentUser } from "@/lib/auth/session"

export function getAdminEmails() {
  return [
    "info@triproofprotocol.com",
    "mcogen@triproofprotocol.com",
    "sdemirbozan@triproofprotocol.com",
    "rkaya@triproofprotocol.com",
    ...(process.env.ADMIN_EMAILS ?? "").split(","),
  ]
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
