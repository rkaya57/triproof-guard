export function databaseConnectionUrl(rawUrl: string) {
  if (process.env.NODE_ENV !== "production") return rawUrl

  try {
    const url = new URL(rawUrl)

    // Supabase pooler/direct URLs can expose a self-signed certificate chain
    // in Vercel's Node runtime. Keep every PostgreSQL client on the same
    // production TLS policy instead of letting worker-only connections fail.
    url.searchParams.delete("sslmode")
    url.searchParams.delete("uselibpqcompat")
    url.searchParams.set("sslmode", "no-verify")

    return url.toString()
  } catch {
    return rawUrl
  }
}
