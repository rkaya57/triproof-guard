import { randomUUID } from "node:crypto"

import { Prisma } from "@prisma/client"

import { db } from "@/lib/db/prisma"

export async function linkWalletWithoutReassignment(input: {
  userId: string
  chain: string
  address: string
}) {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ userId: string }>>(
      Prisma.sql`
        SELECT "userId"
        FROM "AuthWallet"
        WHERE "chain" = ${input.chain} AND "address" = ${input.address}
        FOR UPDATE
      `
    )
    const existing = rows[0]
    if (existing && existing.userId !== input.userId) {
      throw new Error("This wallet is already linked to another account.")
    }
    if (existing) {
      await tx.$executeRaw(
        Prisma.sql`
          UPDATE "AuthWallet"
          SET "lastUsedAt" = CURRENT_TIMESTAMP
          WHERE "chain" = ${input.chain} AND "address" = ${input.address}
        `
      )
      return
    }
    await tx.$executeRaw(
      Prisma.sql`
        INSERT INTO "AuthWallet" (
          "id", "userId", "chain", "address", "createdAt", "lastUsedAt"
        ) VALUES (
          ${randomUUID()}, ${input.userId}, ${input.chain}, ${input.address},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `
    )
  })
}
