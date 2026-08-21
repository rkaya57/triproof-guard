import { createHash } from "node:crypto"

import { Prisma } from "@prisma/client"

import { db } from "@/lib/db/prisma"
import type { NormalizedOnchainEvent } from "@/lib/onchain/events/types"

const EVENT_WRITE_BATCH_SIZE = 500

type EventPersistenceClient = Pick<Prisma.TransactionClient, "normalizedOnchainEvent">

function persistenceId(analysisRunId: string, eventKey: string) {
  return `oce_${createHash("sha256")
    .update(`${analysisRunId}:${eventKey}`)
    .digest("hex")
    .slice(0, 28)}`
}

function jsonSafe(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "bigint") return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((item) => jsonSafe(item) ?? null)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined && typeof nested !== "function" && typeof nested !== "symbol")
        .map(([key, nested]) => [key, jsonSafe(nested)]),
    )
  }
  return null
}

export function buildPersistedEventRows(
  analysisRunId: string,
  events: readonly NormalizedOnchainEvent[],
): Prisma.NormalizedOnchainEventCreateManyInput[] {
  return events.map((event) => ({
    id: persistenceId(analysisRunId, event.eventKey),
    analysisRunId,
    eventKey: event.eventKey,
    chain: event.chain,
    chainFamily: event.chainFamily,
    txHash: event.txHash,
    eventIndex: event.eventIndex,
    walletAddress: event.walletAddress,
    fromAddress: event.fromAddress,
    toAddress: event.toAddress,
    counterpartyAddress: event.counterpartyAddress,
    kind: event.kind,
    direction: event.direction,
    assetSymbol: event.assetSymbol,
    assetAddress: event.assetAddress,
    amount: event.amount === null ? null : new Prisma.Decimal(event.amount),
    observedAt: event.observedAt === null ? null : new Date(event.observedAt),
    blockRef: event.blockRef,
    provider: event.provider,
    confidence: event.confidence,
    metadata: jsonSafe(event.metadata) as Prisma.InputJsonValue,
  }))
}

export async function persistNormalizedOnchainEvents(
  analysisRunId: string,
  events: readonly NormalizedOnchainEvent[],
  client: EventPersistenceClient = db,
) {
  if (events.length === 0) return { attempted: 0, written: 0 }

  const rows = buildPersistedEventRows(analysisRunId, events)
  let written = 0

  for (let index = 0; index < rows.length; index += EVENT_WRITE_BATCH_SIZE) {
    const result = await client.normalizedOnchainEvent.createMany({
      data: rows.slice(index, index + EVENT_WRITE_BATCH_SIZE),
      skipDuplicates: true,
    })
    written += result.count
  }

  return { attempted: rows.length, written }
}
