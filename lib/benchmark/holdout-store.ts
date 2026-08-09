import { db } from "@/lib/db/prisma"
import {
  HOLDOUT_DEFAULT_MODEL,
  buildHoldoutStackFreeze,
  resolveProductionCommitSha,
  verifyHoldoutFreezeIntegrity,
  type HoldoutStackFreeze,
} from "./holdout-v1"

export type HoldoutRunStatus =
  | "frozen"
  | "collecting"
  | "reviewing"
  | "adjudicating"
  | "ready_to_evaluate"
  | "evaluated"
  | "invalidated"

export type PersistedHoldoutRun = {
  id: string
  protocolVersion: string
  status: HoldoutRunStatus
  freezeHash: string
  stackHash: string
  stackCommitSha: string
  freeze: HoldoutStackFreeze
  frozenAt: string
  candidateNotBefore: string
  createdAt: string
  updatedAt: string
}

type HoldoutRunRow = {
  id: string
  protocolVersion: string
  status: string
  freezeHash: string
  stackHash: string
  stackCommitSha: string
  freezeJson: unknown
  frozenAt: Date
  candidateNotBefore: Date
  createdAt: Date
  updatedAt: Date
}

const ACTIVE_STATUSES: HoldoutRunStatus[] = [
  "frozen",
  "collecting",
  "reviewing",
  "adjudicating",
  "ready_to_evaluate",
]

function isStatus(value: string): value is HoldoutRunStatus {
  return [
    "frozen",
    "collecting",
    "reviewing",
    "adjudicating",
    "ready_to_evaluate",
    "evaluated",
    "invalidated",
  ].includes(value)
}

function parseRun(row: HoldoutRunRow): PersistedHoldoutRun {
  if (!isStatus(row.status)) {
    throw new Error(`Unknown holdout validation status: ${row.status}`)
  }
  const freeze = row.freezeJson as HoldoutStackFreeze
  if (!verifyHoldoutFreezeIntegrity(freeze)) {
    throw new Error(`Holdout freeze integrity verification failed for run ${row.id}.`)
  }
  if (
    freeze.freezeHash !== row.freezeHash ||
    freeze.stackHash !== row.stackHash ||
    freeze.stack.commitSha !== row.stackCommitSha.toLowerCase()
  ) {
    throw new Error(`Holdout freeze ledger mismatch for run ${row.id}.`)
  }
  return {
    id: row.id,
    protocolVersion: row.protocolVersion,
    status: row.status,
    freezeHash: row.freezeHash,
    stackHash: row.stackHash,
    stackCommitSha: row.stackCommitSha,
    freeze,
    frozenAt: row.frozenAt.toISOString(),
    candidateNotBefore: row.candidateNotBefore.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function activeRunRows() {
  return db.$queryRaw<HoldoutRunRow[]>`
    SELECT
      "id",
      "protocolVersion",
      "status",
      "freezeHash",
      "stackHash",
      "stackCommitSha",
      "freezeJson",
      "frozenAt",
      "candidateNotBefore",
      "createdAt",
      "updatedAt"
    FROM "HoldoutValidationRun"
    WHERE "status" IN ('frozen', 'collecting', 'reviewing', 'adjudicating', 'ready_to_evaluate')
    ORDER BY "frozenAt" DESC
    LIMIT 2
  `
}

export async function getActiveHoldoutRun() {
  const rows = await activeRunRows()
  if (rows.length > 1) {
    throw new Error("Multiple active holdout runs detected; refusing ambiguous validation state.")
  }
  return rows[0] ? parseRun(rows[0]) : null
}

export async function getHoldoutRun(id: string) {
  const rows = await db.$queryRaw<HoldoutRunRow[]>`
    SELECT
      "id",
      "protocolVersion",
      "status",
      "freezeHash",
      "stackHash",
      "stackCommitSha",
      "freezeJson",
      "frozenAt",
      "candidateNotBefore",
      "createdAt",
      "updatedAt"
    FROM "HoldoutValidationRun"
    WHERE "id" = ${id}
    LIMIT 1
  `
  return rows[0] ? parseRun(rows[0]) : null
}

export async function getLatestHoldoutRun() {
  const rows = await db.$queryRaw<HoldoutRunRow[]>`
    SELECT
      "id",
      "protocolVersion",
      "status",
      "freezeHash",
      "stackHash",
      "stackCommitSha",
      "freezeJson",
      "frozenAt",
      "candidateNotBefore",
      "createdAt",
      "updatedAt"
    FROM "HoldoutValidationRun"
    ORDER BY "frozenAt" DESC
    LIMIT 1
  `
  return rows[0] ? parseRun(rows[0]) : null
}

export async function createIndependentHoldoutFreeze(input?: {
  frozenAt?: string
  commitSha?: string
  model?: string
}) {
  const existing = await getActiveHoldoutRun()
  if (existing) {
    return { created: false, run: existing }
  }

  const commitSha = input?.commitSha ?? resolveProductionCommitSha()
  const model =
    input?.model ?? process.env.GEMINI_EVIDENCE_MODEL ?? HOLDOUT_DEFAULT_MODEL
  const freeze = buildHoldoutStackFreeze({
    commitSha,
    frozenAt: input?.frozenAt,
    model,
  })
  const id = `hv-${freeze.freezeHash.slice(0, 20)}`
  const freezeJson = JSON.stringify(freeze)
  const stackJson = JSON.stringify(freeze.stack)

  try {
    await db.$executeRaw`
      INSERT INTO "HoldoutValidationRun" (
        "id",
        "protocolVersion",
        "status",
        "freezeHash",
        "stackHash",
        "stackCommitSha",
        "stackJson",
        "freezeJson",
        "frozenAt",
        "candidateNotBefore"
      ) VALUES (
        ${id},
        ${freeze.protocolVersion},
        'frozen',
        ${freeze.freezeHash},
        ${freeze.stackHash},
        ${freeze.stack.commitSha},
        ${stackJson}::jsonb,
        ${freezeJson}::jsonb,
        ${new Date(freeze.frozenAt)},
        ${new Date(freeze.candidateNotBefore)}
      )
    `
  } catch (error) {
    const raced = await getActiveHoldoutRun().catch(() => null)
    if (raced) return { created: false, run: raced }
    throw error
  }

  const run = await getHoldoutRun(id)
  if (!run) {
    throw new Error("Holdout freeze was inserted but could not be read back.")
  }
  return { created: true, run }
}

export async function updateHoldoutRunStatus(
  id: string,
  expected: HoldoutRunStatus,
  next: HoldoutRunStatus
) {
  if (!ACTIVE_STATUSES.includes(expected) && expected !== "evaluated") {
    throw new Error(`Unsupported expected holdout status transition: ${expected}`)
  }
  const updated = await db.$executeRaw`
    UPDATE "HoldoutValidationRun"
    SET "status" = ${next}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${id} AND "status" = ${expected}
  `
  if (Number(updated) !== 1) {
    throw new Error(
      `Holdout run ${id} status transition ${expected} -> ${next} was not applied.`
    )
  }
  const run = await getHoldoutRun(id)
  if (!run) throw new Error(`Holdout run ${id} disappeared after status update.`)
  return run
}
