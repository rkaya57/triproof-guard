import { expect, test, type Page } from "@playwright/test"

import { db } from "../lib/db/prisma"

const E2E_PASSWORD = "A-safe-e2e-password-123"
const REPEATED_WALLET = "So11111111111111111111111111111111111111112"
const APPROVED_WALLET = "9xQeWvG816bUx9EPjHmaT23yvVMpK8zHfHqC7D1dJ9nA"
const REJECTED_WALLET = "8nN5xQ6BwYx9iqN41PvY5J2q1y3V1A7S9F1rB2cD3eF4"
const FUNDER_WALLET = "7mM4xP5AvXw8hpM31OuX4I1p0x2U0Z6R8E0qA1bC2dE3"

async function registerWithBrowser(page: Page) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  await page.setExtraHTTPHeaders({ "x-forwarded-for": "192.0.2.230" })
  await page.goto("/register?next=%2Fdashboard%2Fcampaigns")
  await page.getByLabel("Name", { exact: true }).fill("Production-like Campaign QA")
  await page.getByLabel("Email", { exact: true }).fill(`campaign-pilot-${suffix}@example.test`)
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD)
  await page.getByLabel("Confirm password", { exact: true }).fill(E2E_PASSWORD)
  const consents = page.getByRole("checkbox")
  await consents.nth(0).check()
  await consents.nth(1).check()
  await page.getByRole("button", { name: "Create Account", exact: true }).click()
  await expect(page).toHaveURL(/\/onboarding\?next=%2Fdashboard%2Fcampaigns$/, {
    timeout: 15_000,
  })

  const session = await page.request.get("/api/auth/me")
  expect(session.status()).toBe(200)
  const body = (await session.json()) as { user: { id: string } }
  return body.user.id
}

async function seedProductionLikeCampaign(userId: string) {
  const completedAt = new Date("2026-08-06T12:05:00.000Z")
  const createdAt = new Date("2026-08-06T12:00:00.000Z")
  const previousCreatedAt = new Date("2026-07-20T09:00:00.000Z")
  const previousCompletedAt = new Date("2026-07-20T09:03:00.000Z")

  const previousProject = await db.project.create({
    data: {
      userId,
      name: "Previous Solana Rewards Pilot",
      campaignType: "airdrop",
      chain: "solana",
      notes: "Synthetic prior campaign used only by disposable browser QA.",
      createdAt: previousCreatedAt,
      updatedAt: previousCompletedAt,
    },
  })
  const previousAnalysis = await db.analysis.create({
    data: {
      projectId: previousProject.id,
      status: "completed",
      totalWallets: 2,
      approvedCount: 1,
      manualReviewCount: 1,
      rejectedCount: 0,
      averageRiskScore: 51,
      suspiciousClustersCount: 1,
      analysisMode: "hybrid",
      enrichmentStatus: "completed",
      enrichedWalletCount: 2,
      createdAt: previousCreatedAt,
      completedAt: previousCompletedAt,
    },
  })
  const previousRepeatedWallet = await db.walletAnalysis.create({
    data: {
      analysisId: previousAnalysis.id,
      walletAddress: REPEATED_WALLET,
      chain: "solana",
      riskScore: 82,
      riskLevel: "high",
      status: "manual_review",
      recommendedAction: "manual_review",
      statusExplanation: "Shared funding and coordinated timing required human review.",
      fundingSource: FUNDER_WALLET,
      txCount: 18,
      walletAgeDays: 12,
      totalVolume: 4.2,
      contractsCount: 2,
      campaignActionsCount: 9,
      clusterId: "previous-cluster",
      graphComponentId: "previous-component",
      graphRiskScore: 84,
      reasons: [
        "Shared funding relationship detected.",
        "Coordinated timing cohort detected.",
        "Human review required.",
      ],
      enrichmentProvider: "qa-fixture",
      enrichmentStatus: "completed",
      createdAt: previousCreatedAt,
    },
  })
  await db.walletAnalysis.create({
    data: {
      analysisId: previousAnalysis.id,
      walletAddress: APPROVED_WALLET,
      chain: "solana",
      riskScore: 20,
      riskLevel: "low",
      status: "approved",
      recommendedAction: "approve",
      statusExplanation: "Organic participant activity.",
      txCount: 240,
      walletAgeDays: 680,
      totalVolume: 120,
      contractsCount: 19,
      campaignActionsCount: 2,
      reasons: ["Passed campaign policy threshold."],
      enrichmentProvider: "qa-fixture",
      enrichmentStatus: "completed",
      createdAt: previousCreatedAt,
    },
  })
  await db.teamReview.create({
    data: {
      analysisId: previousAnalysis.id,
      walletAnalysisId: previousRepeatedWallet.id,
      walletAddress: REPEATED_WALLET,
      reviewerId: userId,
      previousStatus: "manual_review",
      finalStatus: "rejected",
      feedbackLabel: "confirmed_risk",
      notes: "Prior campaign team confirmed coordinated control after reviewing funding evidence.",
      source: "qa-fixture",
      createdAt: previousCompletedAt,
      updatedAt: previousCompletedAt,
    },
  })
  await db.walletGraphNode.create({
    data: {
      analysisId: previousAnalysis.id,
      nodeKey: `address:solana:${REPEATED_WALLET}:funder`,
      address: REPEATED_WALLET,
      chain: "solana",
      kind: "funder",
      label: "Prior campaign funder",
      componentId: "previous-component",
      metadata: { fixture: true },
      createdAt: previousCreatedAt,
    },
  })

  const project = await db.project.create({
    data: {
      userId,
      name: "Solana Genesis Rewards Pilot",
      campaignType: "airdrop",
      chain: "solana",
      notes: "Production-like synthetic campaign used only by disposable browser QA.",
      createdAt,
      updatedAt: completedAt,
    },
  })
  const analysis = await db.analysis.create({
    data: {
      projectId: project.id,
      status: "completed",
      totalWallets: 3,
      approvedCount: 1,
      manualReviewCount: 1,
      rejectedCount: 1,
      averageRiskScore: 57.7,
      suspiciousClustersCount: 1,
      csvFileName: "production-like-solana-pilot.csv",
      analysisMode: "hybrid",
      enrichmentStatus: "completed",
      enrichmentProvider: "qa-fixture",
      enrichedWalletCount: 3,
      createdAt,
      completedAt,
    },
  })

  await db.walletAnalysis.create({
    data: {
      analysisId: analysis.id,
      walletAddress: APPROVED_WALLET,
      chain: "solana",
      riskScore: 18,
      riskLevel: "low",
      status: "approved",
      recommendedAction: "approve",
      statusExplanation: "Established organic wallet passed campaign policy.",
      txCount: 320,
      walletAgeDays: 720,
      totalVolume: 188,
      contractsCount: 23,
      campaignActionsCount: 2,
      reasons: ["Passed campaign policy threshold."],
      firstSeen: new Date("2024-08-01T00:00:00.000Z"),
      lastSeen: completedAt,
      nativeBalance: 2.4,
      tokenCount: 14,
      uniqueCounterparties: 88,
      lastActiveDaysAgo: 0,
      isContract: false,
      enrichmentProvider: "qa-fixture",
      enrichmentStatus: "completed",
      createdAt,
    },
  })
  const reviewWallet = await db.walletAnalysis.create({
    data: {
      analysisId: analysis.id,
      walletAddress: REPEATED_WALLET,
      chain: "solana",
      riskScore: 64,
      riskLevel: "high",
      status: "manual_review",
      recommendedAction: "manual_review",
      statusExplanation: "Independent funding and timing evidence requires a reviewer.",
      fundingSource: FUNDER_WALLET,
      txCount: 24,
      walletAgeDays: 18,
      totalVolume: 6.8,
      contractsCount: 3,
      campaignActionsCount: 11,
      clusterId: "cluster-shared-funder",
      graphComponentId: "component-shared-funder",
      graphRiskScore: 70,
      reasons: [
        "Shared funding relationship detected.",
        "Coordinated timing cohort detected.",
        "Human review required.",
      ],
      firstSeen: new Date("2026-07-19T00:00:00.000Z"),
      lastSeen: completedAt,
      nativeBalance: 0.08,
      tokenCount: 2,
      uniqueCounterparties: 5,
      lastActiveDaysAgo: 0,
      isContract: false,
      enrichmentProvider: "qa-fixture",
      enrichmentStatus: "completed",
      createdAt,
    },
  })
  const rejectedWallet = await db.walletAnalysis.create({
    data: {
      analysisId: analysis.id,
      walletAddress: REJECTED_WALLET,
      chain: "solana",
      riskScore: 91,
      riskLevel: "critical",
      status: "rejected",
      recommendedAction: "reject",
      statusExplanation: "Known-bad funding and automated behavior were independently corroborated.",
      fundingSource: FUNDER_WALLET,
      txCount: 12,
      walletAgeDays: 5,
      totalVolume: 2.1,
      contractsCount: 1,
      campaignActionsCount: 14,
      clusterId: "cluster-shared-funder",
      graphComponentId: "component-shared-funder",
      graphRiskScore: 90,
      reasons: [
        "Known-bad funding source detected.",
        "Automated behavior pattern detected.",
        "Suspicious cluster membership.",
      ],
      firstSeen: new Date("2026-08-01T00:00:00.000Z"),
      lastSeen: completedAt,
      nativeBalance: 0.01,
      tokenCount: 1,
      uniqueCounterparties: 3,
      lastActiveDaysAgo: 0,
      isContract: false,
      enrichmentProvider: "qa-fixture",
      enrichmentStatus: "completed",
      createdAt,
    },
  })

  await db.cluster.create({
    data: {
      analysisId: analysis.id,
      clusterLabel: "Shared Funder Cohort",
      walletCount: 2,
      averageRiskScore: 77.5,
      sharedFundingSource: FUNDER_WALLET,
      behaviorSimilarityScore: 86,
      suggestedAction: "reject",
      reasons: ["Shared funding relationship", "Coordinated timing cohort"],
      createdAt,
    },
  })
  await db.teamReview.create({
    data: {
      analysisId: analysis.id,
      walletAnalysisId: rejectedWallet.id,
      walletAddress: REJECTED_WALLET,
      reviewerId: userId,
      previousStatus: "rejected",
      finalStatus: "rejected",
      feedbackLabel: "confirmed_risk",
      notes: "Reviewer confirmed the rejection after inspecting independent graph evidence.",
      source: "qa-fixture",
      createdAt: completedAt,
      updatedAt: completedAt,
    },
  })
  await db.feedbackEvent.create({
    data: {
      analysisId: analysis.id,
      walletAnalysisId: reviewWallet.id,
      walletAddress: REPEATED_WALLET,
      userId,
      label: "needs_more_data",
      originalStatus: "manual_review",
      finalStatus: "manual_review",
      riskScore: 64,
      riskLevel: "high",
      reasonsSnapshot: ["Shared funding relationship", "Coordinated timing cohort"],
      notes: "Awaiting additional campaign evidence before the final human decision.",
      source: "qa-fixture",
      createdAt: completedAt,
    },
  })

  const approvedKey = `address:solana:${APPROVED_WALLET}`
  const reviewKey = `address:solana:${REPEATED_WALLET}`
  const rejectedKey = `address:solana:${REJECTED_WALLET}`
  const funderKey = `address:solana:${FUNDER_WALLET}`

  await db.walletGraphSummary.create({
    data: {
      analysisId: analysis.id,
      totalNodes: 4,
      totalEdges: 2,
      connectedWallets: 2,
      externalFunders: 1,
      referralLinks: 0,
      highRiskComponents: 1,
      neutralServiceFunders: 0,
      largestComponent: 3,
      maxComponentRisk: 90,
      components: [
        {
          componentId: "component-shared-funder",
          nodeKeys: [reviewKey, rejectedKey, funderKey],
          walletAddresses: [REPEATED_WALLET, REJECTED_WALLET],
          edgeCount: 2,
          riskScore: 90,
          severity: "critical",
          dominantFunder: FUNDER_WALLET,
          dominantReferrer: null,
          reasons: ["Shared funding relationship", "Coordinated timing cohort"],
        },
      ],
      findings: ["Two campaign participants share the same external funding source."],
      createdAt,
      updatedAt: completedAt,
    },
  })
  await db.walletGraphNode.createMany({
    data: [
      {
        analysisId: analysis.id,
        nodeKey: approvedKey,
        address: APPROVED_WALLET,
        chain: "solana",
        kind: "wallet",
        label: "Approved participant",
        walletAddress: APPROVED_WALLET,
        metadata: { fixture: true },
        createdAt,
      },
      {
        analysisId: analysis.id,
        nodeKey: reviewKey,
        address: REPEATED_WALLET,
        chain: "solana",
        kind: "wallet",
        label: "Gray Zone participant",
        walletAddress: REPEATED_WALLET,
        componentId: "component-shared-funder",
        metadata: { fixture: true },
        createdAt,
      },
      {
        analysisId: analysis.id,
        nodeKey: rejectedKey,
        address: REJECTED_WALLET,
        chain: "solana",
        kind: "wallet",
        label: "Not eligible participant",
        walletAddress: REJECTED_WALLET,
        componentId: "component-shared-funder",
        metadata: { fixture: true },
        createdAt,
      },
      {
        analysisId: analysis.id,
        nodeKey: funderKey,
        address: FUNDER_WALLET,
        chain: "solana",
        kind: "funder",
        label: "Shared external funder",
        componentId: "component-shared-funder",
        metadata: { fixture: true },
        createdAt,
      },
    ],
  })
  await db.walletGraphEdge.createMany({
    data: [
      {
        analysisId: analysis.id,
        edgeKey: "funded:review-wallet",
        sourceKey: funderKey,
        targetKey: reviewKey,
        kind: "funded",
        confidence: 92,
        isRiskBearing: true,
        componentId: "component-shared-funder",
        observedAt: new Date("2026-08-05T08:00:00.000Z"),
        transactionId: "qa-funding-transaction-review",
        amount: 0.08,
        evidence: ["Observed first funding transaction from shared external funder."],
        metadata: { fixture: true },
        createdAt,
      },
      {
        analysisId: analysis.id,
        edgeKey: "funded:rejected-wallet",
        sourceKey: funderKey,
        targetKey: rejectedKey,
        kind: "funded",
        confidence: 97,
        isRiskBearing: true,
        componentId: "component-shared-funder",
        observedAt: new Date("2026-08-05T08:02:00.000Z"),
        transactionId: "qa-funding-transaction-rejected",
        amount: 0.08,
        evidence: ["Observed matching funding transaction from shared external funder."],
        metadata: { fixture: true },
        createdAt,
      },
    ],
  })

  return { project, analysis }
}

test.describe("production-like Campaign Security smoke", () => {
  test.setTimeout(90_000)

  test("renders and computes the complete campaign stack from a populated Solana fixture", async ({ page }) => {
    const userId = await registerWithBrowser(page)
    const { project, analysis } = await seedProductionLikeCampaign(userId)

    const pages = [
      `/dashboard/campaigns/${project.id}`,
      `/dashboard/campaigns/${project.id}/risk-graph`,
      `/dashboard/campaigns/${project.id}/risk-memory`,
      `/dashboard/campaigns/${project.id}/policy`,
      `/dashboard/campaigns/${project.id}/metrics`,
    ]

    for (const route of pages) {
      const response = await page.goto(route)
      expect(response?.status(), route).toBe(200)
      await expect(page.getByText(project.name, { exact: true }).first()).toBeVisible()
      const body = await page.locator("body").innerText()
      expect(body).not.toContain("temporarily unavailable")
      expect(body).not.toContain("could not be loaded")
    }

    await page.goto(`/dashboard/campaigns/${project.id}`)
    await expect(page.getByText("Gray Zone rate", { exact: true })).toBeVisible()
    await expect(page.getByText("Not eligible rate", { exact: true })).toBeVisible()
    await expect(page.getByText("Evidence coverage", { exact: true })).toBeVisible()
    await expect(page.getByText("Not configured", { exact: true })).toBeVisible()

    const graphResponse = await page.request.get(`/api/campaigns/${project.id}/risk-graph`)
    expect(graphResponse.status()).toBe(200)
    const graphBody = (await graphResponse.json()) as {
      graph: {
        schemaVersion: string
        summary: { nodeCount: number; edgeCount: number; riskBearingEdgeCount: number }
        coverage: { walletGraph: boolean }
      }
    }
    expect(graphBody.graph.schemaVersion).toBe("tri-proof-risk-graph-v1")
    expect(graphBody.graph.coverage.walletGraph).toBe(true)
    expect(graphBody.graph.summary.nodeCount).toBeGreaterThanOrEqual(6)
    expect(graphBody.graph.summary.edgeCount).toBeGreaterThanOrEqual(5)
    expect(graphBody.graph.summary.riskBearingEdgeCount).toBeGreaterThanOrEqual(2)

    const memoryResponse = await page.request.get(`/api/campaigns/${project.id}/risk-memory`)
    expect(memoryResponse.status()).toBe(200)
    const memoryBody = (await memoryResponse.json()) as {
      memory: {
        schemaVersion: string
        summary: { matchedEntities: number; entitiesWithPriorRejection: number }
        matches: Array<{ value: string; priorRejectedCount: number; crossRole: boolean }>
      }
    }
    expect(memoryBody.memory.schemaVersion).toBe("tri-proof-cross-campaign-risk-memory-v1")
    expect(memoryBody.memory.summary.matchedEntities).toBeGreaterThanOrEqual(1)
    expect(memoryBody.memory.summary.entitiesWithPriorRejection).toBeGreaterThanOrEqual(1)
    expect(
      memoryBody.memory.matches.some(
        (match) =>
          match.value === REPEATED_WALLET &&
          match.priorRejectedCount >= 1 &&
          match.crossRole
      )
    ).toBe(true)

    const policyResponse = await page.request.get(`/api/campaigns/${project.id}/policy?preset=balanced`)
    expect(policyResponse.status()).toBe(200)
    const policyBody = (await policyResponse.json()) as {
      report: {
        schemaVersion: string
        analysisId: string
        coverage: { walletsEvaluated: number; riskMemoryAvailable: boolean }
        recommendations: Array<{ walletAddress: string; matchedRules: unknown[] }>
      }
    }
    expect(policyBody.report.schemaVersion).toBe("tri-proof-campaign-policy-v1")
    expect(policyBody.report.analysisId).toBe(analysis.id)
    expect(policyBody.report.coverage.walletsEvaluated).toBe(3)
    expect(policyBody.report.coverage.riskMemoryAvailable).toBe(true)
    expect(policyBody.report.recommendations).toHaveLength(3)
    expect(
      policyBody.report.recommendations.some(
        (recommendation) =>
          recommendation.walletAddress === REPEATED_WALLET &&
          recommendation.matchedRules.length > 0
      )
    ).toBe(true)

    const metricsResponse = await page.request.get(`/api/campaigns/${project.id}/metrics`)
    expect(metricsResponse.status()).toBe(200)
    const metricsBody = (await metricsResponse.json()) as {
      campaignId: string
      report: {
        schemaVersion: string
        analysisId: string
        summary: { totalWallets: number; manualReviewRate: number; rejectionRate: number }
        coverage: { riskMemoryAvailable: boolean; policyAvailable: boolean }
      }
    }
    expect(metricsBody.campaignId).toBe(project.id)
    expect(metricsBody.report.schemaVersion).toBe("tri-proof-campaign-benchmark-v1")
    expect(metricsBody.report.analysisId).toBe(analysis.id)
    expect(metricsBody.report.summary.totalWallets).toBe(3)
    expect(metricsBody.report.summary.manualReviewRate).toBeCloseTo(33.33, 1)
    expect(metricsBody.report.summary.rejectionRate).toBeCloseTo(33.33, 1)
    expect(metricsBody.report.coverage.riskMemoryAvailable).toBe(true)
    expect(metricsBody.report.coverage.policyAvailable).toBe(true)
  })
})
