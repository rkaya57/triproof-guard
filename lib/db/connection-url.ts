function isLoopbackDatabaseHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1"
}

export function databaseConnectionUrl(rawUrl: string) {
  if (process.env.NODE_ENV !== "production") return rawUrl

  try {
    const url = new URL(rawUrl)

    // Local production-bundle and self-hosted checks can use a loopback
    // PostgreSQL server without TLS. Do not force the hosted certificate
    // policy onto those connections.
    if (isLoopbackDatabaseHost(url.hostname)) return rawUrl

    // Supabase pooler/direct URLs can expose a self-signed certificate chain
    // in Vercel's Node runtime. Keep every hosted PostgreSQL client on the same
    // production TLS policy instead of letting worker-only connections fail.
    url.searchParams.delete("sslmode")
    url.searchParams.delete("uselibpqcompat")
    url.searchParams.set("sslmode", "no-verify")

    return url.toString()
  } catch {
    return rawUrl
  }
}

export function databaseConnectionUsesTls(connectionString: string) {
  try {
    const url = new URL(connectionString)
    if (isLoopbackDatabaseHost(url.hostname)) return false
    const mode = url.searchParams.get("sslmode")?.toLowerCase()
    return mode !== "disable" && mode !== "allow" && mode !== "prefer"
  } catch {
    return process.env.NODE_ENV === "production"
  }
}
