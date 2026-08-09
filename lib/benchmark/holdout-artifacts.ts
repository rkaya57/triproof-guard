import { createHash } from "node:crypto"

import { db } from "@/lib/db/prisma"

export type HoldoutArtifactKind =
  | "review_bundle"
  | "private_seal"
  | "reviewer_a"
  | "reviewer_b"
  | "adjudicator"
  | "ground_truth"
  | "evaluation"

export type PersistedHoldoutArtifact<T = unknown> = {
  id: string
  runId: string
  kind: HoldoutArtifactKind
  artifactHash: string
  payload: T
  createdAt: string
  updatedAt: string
}

type HoldoutArtifactRow = {
  id: string
  runId: string
  kind: string
  artifactHash: string
  payloadJson: unknown
  createdAt: Date
  updatedAt: Date
}

const ARTIFACT_KINDS: HoldoutArtifactKind[] = [
  "review_bundle",
  "private_seal",
  "reviewer_a",
  "reviewer_b",
  "adjudicator",
  "ground_truth",
  "evaluation",
]

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function isKind(value: string): value is HoldoutArtifactKind {
  return ARTIFACT_KINDS.includes(value as HoldoutArtifactKind)
}

function parseArtifact<T>(row: HoldoutArtifactRow): PersistedHoldoutArtifact<T> {
  if (!isKind(row.kind)) {
    throw new Error(`Unknown holdout artifact kind: ${row.kind}`)
  }
  return {
    id: row.id,
    runId: row.runId,
    kind: row.kind,
    artifactHash: row.artifactHash,
    payload: row.payloadJson as T,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function hashHoldoutArtifactPayload(payload: unknown) {
  return sha256(JSON.stringify(payload))
}

export async function getHoldoutArtifact<T = unknown>(
  runId: string,
  kind: HoldoutArtifactKind
) {
  const rows = await db.$queryRaw<HoldoutArtifactRow[]>`
    SELECT
      "id",
      "runId",
      "kind",
      "artifactHash",
      "payloadJson",
      "createdAt",
      "updatedAt"
    FROM "HoldoutValidationArtifact"
    WHERE "runId" = ${runId} AND "kind" = ${kind}
    LIMIT 1
  `
  return rows[0] ? parseArtifact<T>(rows[0]) : null
}

export async function putImmutableHoldoutArtifact<T>(input: {
  runId: string
  kind: HoldoutArtifactKind
  payload: T
}) {
  const artifactHash = hashHoldoutArtifactPayload(input.payload)
  const existing = await getHoldoutArtifact<T>(input.runId, input.kind)
  if (existing) {
    if (existing.artifactHash !== artifactHash) {
      throw new Error(
        `Holdout artifact ${input.kind} for run ${input.runId} is already frozen with a different hash.`
      )
    }
    return { created: false, artifact: existing }
  }

  const id = `ha-${sha256(`${input.runId}:${input.kind}:${artifactHash}`).slice(0, 24)}`
  const payloadJson = JSON.stringify(input.payload)

  try {
    await db.$executeRaw`
      INSERT INTO "HoldoutValidationArtifact" (
        "id",
        "runId",
        "kind",
        "artifactHash",
        "payloadJson"
      ) VALUES (
        ${id},
        ${input.runId},
        ${input.kind},
        ${artifactHash},
        ${payloadJson}::jsonb
      )
    `
  } catch (error) {
    const raced = await getHoldoutArtifact<T>(input.runId, input.kind).catch(() => null)
    if (raced) {
      if (raced.artifactHash !== artifactHash) {
        throw new Error(
          `Holdout artifact ${input.kind} for run ${input.runId} raced with a different frozen hash.`
        )
      }
      return { created: false, artifact: raced }
    }
    throw error
  }

  const artifact = await getHoldoutArtifact<T>(input.runId, input.kind)
  if (!artifact) {
    throw new Error(`Holdout artifact ${input.kind} was inserted but could not be read back.`)
  }
  return { created: true, artifact }
}
