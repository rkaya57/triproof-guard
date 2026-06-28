import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"

import type { AnalysisDetail, AnalysisMode, AnalysisResult } from "@/types"

type StoredUser = {
  id: string
  name: string
  email: string
  passwordHash: string
  createdAt: string
  updatedAt: string
}

type DevStore = {
  users: StoredUser[]
  analyses: Array<{
    ownerUserId: string
    analysis: AnalysisDetail
  }>
}

type CreateAnalysisInput = {
  userId: string
  projectName: string
  campaignType: string
  chain: string
  notes: string | null
  csvFileName: string
  analysisMode?: AnalysisMode
  result: AnalysisResult
}

const storePath = path.join(process.cwd(), ".data", "dev-store.json")

async function readStore(): Promise<DevStore> {
  try {
    const rawStore = JSON.parse(await readFile(storePath, "utf8")) as {
      users?: StoredUser[]
      analyses?: Array<AnalysisDetail | { ownerUserId: string; analysis: AnalysisDetail }>
    }

    return {
      users: rawStore.users ?? [],
      analyses: (rawStore.analyses ?? []).map((item) =>
        "analysis" in item
          ? item
          : { ownerUserId: "legacy", analysis: item }
      ),
    }
  } catch {
    return { users: [], analyses: [] }
  }
}

async function writeStore(store: DevStore) {
  await mkdir(path.dirname(storePath), { recursive: true })
  await writeFile(storePath, JSON.stringify(store, null, 2))
}

export async function findDevUserByEmail(email: string) {
  const store = await readStore()
  return store.users.find((user) => user.email === email.toLowerCase()) ?? null
}

export async function findDevUserById(id: string) {
  const store = await readStore()
  const user = store.users.find((candidate) => candidate.id === id)
  if (!user) return null

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: new Date(user.createdAt),
  }
}

export async function createDevUser(input: {
  name: string
  email: string
  passwordHash: string
}) {
  const store = await readStore()
  const now = new Date().toISOString()
  const user: StoredUser = {
    id: `dev_${randomUUID()}`,
    name: input.name,
    email: input.email.toLowerCase(),
    passwordHash: input.passwordHash,
    createdAt: now,
    updatedAt: now,
  }

  store.users.push(user)
  await writeStore(store)

  return { id: user.id, name: user.name, email: user.email }
}

export async function getDevUserWithPasswordByEmail(email: string) {
  return findDevUserByEmail(email)
}

export async function saveDevAnalysis(input: CreateAnalysisInput) {
  const store = await readStore()
  const now = new Date().toISOString()
  const projectId = `project_${randomUUID()}`
  const analysisId = `analysis_${randomUUID()}`
  const analysis: AnalysisDetail = {
    id: analysisId,
    status: "completed",
    totalWallets: input.result.totalWallets,
    approvedCount: input.result.approvedCount,
    manualReviewCount: input.result.manualReviewCount,
    rejectedCount: input.result.rejectedCount,
    averageRiskScore: input.result.averageRiskScore,
    suspiciousClustersCount: input.result.clusters.length,
    csvFileName: input.csvFileName,
    analysisMode: input.analysisMode ?? "csv_only",
    enrichment: input.result.enrichment ?? null,
    createdAt: now,
    completedAt: now,
    project: {
      id: projectId,
      name: input.projectName,
      campaignType: input.campaignType,
      chain: input.chain,
      notes: input.notes,
    },
    wallets: input.result.wallets,
    clusters: input.result.clusters,
  }

  store.analyses.push({ ownerUserId: input.userId, analysis })
  await writeStore(store)

  return analysis
}

export async function getDevAnalysisForUser(userId: string, analysisId: string) {
  const store = await readStore()
  return (
    store.analyses.find(
      (item) => item.ownerUserId === userId && item.analysis.id === analysisId
    )?.analysis ?? null
  )
}

export async function getDevDashboard(user: {
  id: string
  name: string
  email: string
}) {
  const store = await readStore()
  const analyses = store.analyses
    .filter((item) => item.ownerUserId === user.id)
    .map((item) => item.analysis)
  const totalWallets = analyses.reduce(
    (sum, analysis) => sum + analysis.totalWallets,
    0
  )
  const rejectedCount = analyses.reduce(
    (sum, analysis) => sum + analysis.rejectedCount,
    0
  )
  const averageRiskScore = analyses.length
    ? analyses.reduce((sum, analysis) => sum + analysis.averageRiskScore, 0) /
      analyses.length
    : 0

  return {
    user,
    stats: {
      projectCount: new Set(analyses.map((analysis) => analysis.project.id)).size,
      totalWallets,
      averageRiskScore: Number(averageRiskScore.toFixed(1)),
      highRiskRate:
        totalWallets > 0 ? Math.round((rejectedCount / totalWallets) * 100) : 0,
    },
    recentAnalyses: analyses
      .slice()
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      )
      .slice(0, 6)
      .map((analysis) => ({
        id: analysis.id,
        projectName: analysis.project.name,
        campaignType: analysis.project.campaignType,
        chain: analysis.project.chain,
        status: analysis.status,
        totalWallets: analysis.totalWallets,
        averageRiskScore: analysis.averageRiskScore,
        rejectedCount: analysis.rejectedCount,
        createdAt: analysis.createdAt,
      })),
  }
}
