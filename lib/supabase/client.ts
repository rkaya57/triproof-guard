"use client"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Browser-side Supabase client.
 *
 * Uses the public project URL and the publishable key (safe to expose to the
 * browser). Returns `null` when env vars are missing so callers can degrade
 * gracefully instead of throwing at import time.
 */
let browserClient: SupabaseClient | null = null

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (browserClient) return browserClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Supabase env vars are not set; browser client unavailable.")
    }
    return null
  }

  browserClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  })
  return browserClient
}

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
)
