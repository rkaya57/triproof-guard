const defaultPostAuthPath = "/dashboard"

export function safePostAuthPath(value: unknown, fallback = defaultPostAuthPath) {
  if (typeof value !== "string") return fallback

  const path = value.trim()
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\r\n]/.test(path)) {
    return fallback
  }

  const pathname = path.split("?", 1)[0]
  if (pathname === "/login" || pathname === "/register" || pathname.startsWith("/api/")) {
    return fallback
  }

  return path
}

export function loginPathFor(nextPath: string) {
  return `/login?next=${encodeURIComponent(safePostAuthPath(nextPath))}`
}
