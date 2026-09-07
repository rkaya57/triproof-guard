import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"

import {
  consumeHumanityRateLimit,
  pruneHumanityAbuseBuckets,
} from "@/lib/humanity/v2/abuse-defense"
import { db } from "@/lib/db/prisma"
import { closeHumanitySessionAsFailed } from "@/lib/humanity/v2/session-lifecycle"

const SECRET = "humanity-v2-5-postgres-integration-secret"

test("V2.5 Postgres bucket increments atomically under concurrent requests", async () => {
  const subject = `integration-${randomUUID()}`
  const rule = {
    dimension: "session" as const,
    subject,
    limit: 5,
    windowMs: 60_000,
  }
  const nowMs = 1_800_000

  const results = await Promise.all(
    Array.from({ length: 8 }, () => consumeHumanityRateLimit({
      action: "CHAIN_STEP",
      rule,
      secret: SECRET,
      nowMs,
    }))
  )

  assert.deepEqual(results.map((item) => item.count).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.equal(results.filter((item) => item.allowed).length, 5)
  assert.equal(results.filter((item) => !item.allowed).length, 3)
  assert.equal(Math.max(...results.map((item) => item.count)), 8)

  await pruneHumanityAbuseBuckets()
})

test("V2.5 lifecycle closes a pending session once and persists one audit event", async () => {
  const suffix = randomUUID().replaceAll("-", "")
  const campaign = await db.humanityCampaign.create({
    data: {
      name: `Humanity V2.5 CI ${suffix}`,
      slug: `humanity-v25-ci-${suffix}`,
      maxAttemptsPerWallet: 3,
    },
  })

  try {
    const session = await db.humanityChallengeSession.create({
      data: {
        campaignId: campaign.id,
        walletAddress: `wallet-${suffix}`,
        walletChain: "solana",
        nonce: suffix.padEnd(64, "0").slice(0, 64),
        challengeSequence: ["LOOK_CENTER", "BLINK"],
        expiresAt: new Date(Date.now() + 60_000),
      },
    })

    const first = await closeHumanitySessionAsFailed({
      sessionId: session.id,
      event: "CANCELLED_BY_CLIENT",
      detail: "integration-test",
    })
    const second = await closeHumanitySessionAsFailed({
      sessionId: session.id,
      event: "CANCELLED_BY_CLIENT",
      detail: "duplicate-integration-test",
    })

    assert.equal(first, true)
    assert.equal(second, false)

    const storedSession = await db.humanityChallengeSession.findUniqueOrThrow({ where: { id: session.id } })
    assert.equal(storedSession.status, "FAILED")

    const events = await db.humanitySessionLifecycleEvent.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
    })
    assert.equal(events.length, 1)
    assert.equal(events[0].event, "CANCELLED_BY_CLIENT")
    assert.equal(events[0].detail, "integration-test")

    await db.humanityCampaign.delete({ where: { id: campaign.id } })
    const afterCascade = await db.humanitySessionLifecycleEvent.count({ where: { sessionId: session.id } })
    assert.equal(afterCascade, 0)
  } finally {
    await db.humanityCampaign.deleteMany({ where: { id: campaign.id } }).catch(() => undefined)
  }
})

test.after(async () => {
  await db.$disconnect()
})
