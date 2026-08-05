import type { AirdropTaskType } from "@prisma/client"

export const DAILY_CHECK_IN_POINTS = 25
export const DAILY_CHECK_IN_SLUG_PREFIX = "daily-check-in-"

export type DailyCheckInStatus = "READY" | "CLAIMED" | "REGISTRATION_REQUIRED"

export function utcCheckInDate(value: Date) {
  return value.toISOString().slice(0, 10)
}

export function nextUtcCheckInReset(value: Date) {
  return new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate() + 1,
    0,
    0,
    0,
    0
  ))
}

export function dailyCheckInTaskSlug(value: Date) {
  return `${DAILY_CHECK_IN_SLUG_PREFIX}${utcCheckInDate(value)}`
}

export function isDailyCheckInTaskSlug(value: string | null | undefined) {
  return Boolean(value?.startsWith(DAILY_CHECK_IN_SLUG_PREFIX))
}

export function dailyCheckInTaskDefinition(value: Date) {
  const checkInDate = utcCheckInDate(value)
  return {
    slug: dailyCheckInTaskSlug(value),
    title: `Daily check-in — ${checkInDate} UTC`,
    description:
      "Automatically approved daily contribution check-in. Each account can receive this reward once per UTC day.",
    targetUrl: null,
    type: "THREAT_REPORT" as AirdropTaskType,
    points: DAILY_CHECK_IN_POINTS,
    proofRequired: false,
    active: false,
    sortOrder: -1_000,
  }
}
