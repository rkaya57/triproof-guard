const numberFormatter = new Intl.NumberFormat("en-US")

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "2-digit",
})

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

function parseDate(value: string | Date | null | undefined) {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatNumber(value: number | null | undefined) {
  return numberFormatter.format(value ?? 0)
}

export function formatDateUTC(value: string | Date | null | undefined) {
  const parsed = parseDate(value)
  return parsed ? dateFormatter.format(parsed) : "-"
}

export function formatDateTimeUTC(value: string | Date | null | undefined) {
  const parsed = parseDate(value)
  return parsed ? `${dateTimeFormatter.format(parsed)} UTC` : "-"
}

export function formatTimeUTC(value: string | Date | null | undefined) {
  const parsed = parseDate(value)
  return parsed ? `${timeFormatter.format(parsed)} UTC` : "-"
}
