export function isDatabaseConnectionError(error: unknown) {
  if (typeof error !== "object" || error === null) return false

  const maybeError = error as { code?: unknown; message?: unknown }
  const message =
    typeof maybeError.message === "string"
      ? maybeError.message.toLowerCase()
      : ""

  return (
    ["ECONNREFUSED", "P1001", "P2021", "P2022"].includes(
      String(maybeError.code)
    ) ||
    ["econnrefused", "can't reach database", "does not exist"].some((text) =>
      message.includes(text)
    )
  )
}

export const databaseUnavailableMessage =
  "Database is not running. Start PostgreSQL, set .env, then run npm run db:migrate."
