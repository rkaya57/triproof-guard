import type { AirdropTaskType, Prisma, PrismaClient } from "@prisma/client"

export const AIRDROP_SEASON_NAME = "Season 0"
export const TRIPROOF_X_URL = "https://x.com/TriProof_"

export type AirdropTaskDefinition = {
  slug: string
  title: string
  description: string
  type: AirdropTaskType
  points: number
  proofRequired: boolean
  sortOrder: number
}

export const AIRDROP_TASK_DEFINITIONS: AirdropTaskDefinition[] = [
  {
    slug: "x-follow-triproof",
    title: "Follow Tri-Proof on X",
    description:
      "Follow the official Tri-Proof Protocol X account at https://x.com/TriProof_ and submit a screenshot as proof.",
    type: "X_FOLLOW",
    points: 100,
    proofRequired: true,
    sortOrder: 10,
  },
  {
    slug: "x-quote-triproof-post",
    title: "Quote a Tri-Proof post",
    description:
      "Quote-share any post from the official Tri-Proof Protocol X account and submit the quote URL plus screenshot evidence.",
    type: "X_QUOTE",
    points: 180,
    proofRequired: true,
    sortOrder: 20,
  },
  {
    slug: "scamguard-feedback",
    title: "Test ScamGuard and leave feedback",
    description:
      "Run the one-time ScamGuard Solana readiness test, then submit feedback and optional screenshot evidence for admin review.",
    type: "HUMANITY_GATE_FEEDBACK",
    points: 250,
    proofRequired: false,
    sortOrder: 30,
  },
]

export const AIRDROP_TASK_TYPES: AirdropTaskType[] = [
  "X_FOLLOW",
  "X_QUOTE",
  "HUMANITY_GATE_FEEDBACK",
]

type AirdropTaskClient = Pick<PrismaClient, "airdropTask">
type AirdropTaskTransaction = Prisma.TransactionClient

export async function ensureAirdropTasks(dbClient: AirdropTaskClient | AirdropTaskTransaction) {
  const activeSlugs = AIRDROP_TASK_DEFINITIONS.map((task) => task.slug)

  await Promise.all(
    AIRDROP_TASK_DEFINITIONS.map((task) =>
      dbClient.airdropTask.upsert({
        where: { slug: task.slug },
        update: {
          title: task.title,
          description: task.description,
          type: task.type,
          points: task.points,
          proofRequired: task.proofRequired,
          active: true,
          sortOrder: task.sortOrder,
        },
        create: {
          slug: task.slug,
          title: task.title,
          description: task.description,
          type: task.type,
          points: task.points,
          proofRequired: task.proofRequired,
          active: true,
          sortOrder: task.sortOrder,
        },
      })
    )
  )

  await dbClient.airdropTask.updateMany({
    where: {
      active: true,
      slug: { notIn: activeSlugs },
    },
    data: { active: false },
  })
}

export function normalizeXHandle(value: string) {
  const trimmed = value.trim().replace(/^@/, "")
  return trimmed ? `@${trimmed}` : ""
}

export function isValidEvidenceImage(value: unknown) {
  if (typeof value !== "string" || !value) return false
  if (!value.startsWith("data:image/")) return false
  return value.length <= 1_750_000
}

export function isLikelyUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

export function isAirdropSchemaMissing(error: unknown) {
  if (typeof error !== "object" || error === null) return false
  const code = "code" in error ? String((error as { code?: unknown }).code) : ""
  const message = error instanceof Error ? error.message.toLowerCase() : ""
  return (
    code === "P2021" ||
    code === "P2022" ||
    message.includes("airdroptask") ||
    message.includes("airdropprofile") ||
    message.includes("airdropsubmission") ||
    message.includes("does not exist")
  )
}

export function airdropSchemaMissingResponse() {
  return {
    error:
      "Airdrop database tables are not ready yet. Production migration is being applied; refresh shortly.",
    code: "AIRDROP_SCHEMA_NOT_READY",
  }
}
