// Server-only Supabase client. Do not import from client components.
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Server-side Supabase client.
 *
 * Prefers the secret key (full privileges, server only) when configured, and
 * falls back to the publishable key otherwise. Returns `null` when env vars are
 * missing. Never import this from a client component.
 */
export function getSupabaseServerClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) return null

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export const isSupabaseServerConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
)
