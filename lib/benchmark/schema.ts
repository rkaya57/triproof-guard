import { z } from "zod"

import type { ParsedWallet, RiskPolicy, WalletStatus } from "@/types"

export const BENCHMARK_DATASET_SCHEMA_VERSION =
  "tri-proof-labeled-benchmark-v1" as const
export const BENCHMARK_SCENARIO_SCHEMA_VERSION =
  "tri-proof-benchmark-scenario-v1" as const

export const benchmarkLabelSchema = z.enum([
  "organic_user",
  "sybil",
  "bot",
  "non_user_entity",
  "insufficient_data",
])

export const benchmarkProvenanceKindSchema = z.enum([
  "verified_human",
  "public_reference",
  "synthetic_adversarial",
  "synthetic_regression",
])

export const benchmarkSplitSchema = z.enum([
  "development",
  "validation",
  "holdout",
])

export const benchmarkMaliciousExpectationSchema = z.enum([
  "present",
  "absent",
  "unknown",
])

export const walletStatusSchema = z.enum([
  "approved",
  "manual_review",
  "rejected",
])

export const riskPolicySchema = z.enum([
  "conservative",
  "balanced",
  "strict",
])

const nullableFiniteNumber = z.number().finite().nullable()
const nullableNonNegativeInteger = z.number().int().nonnegative().nullable()
const nullableString = z.string().nullable()

export const benchmarkWalletInputSchema = z
  .object({
    walletAddress: z.string().min(1),
    chain: z.string().min(1),
    txCount: nullableNonNegativeInteger,
    walletAgeDays: nullableNonNegativeInteger,
    fundingSource: nullableString,
    firstFundingAt: nullableString.optional(),
    firstFundingAmount: nullableFiniteNumber.optional(),
    historyTruncated: z.boolean().nullable().optional(),
    firstSeen: nullableString,
    lastSeen: nullableString,
    totalVolume: nullableFiniteNumber,
    contractsCount: nullableNonNegativeInteger,
    campaignActionsCount: nullableNonNegativeInteger,
    nativeBalance: nullableFiniteNumber.optional(),
    tokenCount: nullableNonNegativeInteger.optional(),
    uniqueCounterparties: nullableNonNegativeInteger.optional(),
    lastActiveDaysAgo: nullableNonNegativeInteger.optional(),
    isContract: z.boolean().nullable().optional(),
    knownEntityLabel: nullableString.optional(),
    knownEntityType: z
      .enum([
        "exchange",
        "service",
        "bridge",
        "contract",
        "protocol",
        "unknown",
        "user",
      ])
      .nullable()
      .optional(),
    accountType: nullableString.optional(),
    ownerProgram: nullableString.optional(),
    behaviorFingerprint: z.array(z.string()).nullable().optional(),
    campaignQualityScore: nullableFiniteNumber.optional(),
    campaignOnlyRatio: nullableFiniteNumber.optional(),
    behaviorDiversityScore: nullableFiniteNumber.optional(),
    botScriptScore: nullableFiniteNumber.optional(),
    policyAction: z
      .enum(["approve", "manual_review", "reject"])
      .nullable()
      .optional(),
    reputationLabel: nullableString.optional(),
    policyReason: nullableString.optional(),
    customerLabel: nullableString.optional(),
    referrerAddress: nullableString.optional(),
    referralCode: nullableString.optional(),
    referralTimestamp: nullableString.optional(),
    campaignEventAt: nullableString.optional(),
    campaignEventType: nullableString.optional(),
    campaignPoints: nullableFiniteNumber.optional(),
    participantFingerprint: nullableString.optional(),
    enrichmentProvider: nullableString.optional(),
    enrichmentStatus: z
      .enum(["pending", "processing", "completed", "failed", "skipped"])
      .nullable()
      .optional(),
    sourceRow: z.number().int().positive().optional(),
  })
  .strict()

export const benchmarkGroundTruthSchema = z
  .object({
    label: benchmarkLabelSchema,
    expectedDecision: walletStatusSchema,
    acceptableDecisions: z.array(walletStatusSchema).min(1),
    maliciousRiskExpectation: benchmarkMaliciousExpectationSchema,
    rationale: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.acceptableDecisions.includes(value.expectedDecision)) {
      context.addIssue({
        code: "custom",
        message: "acceptableDecisions must include expectedDecision",
        path: ["acceptableDecisions"],
      })
    }

    if (
      (value.label === "sybil" || value.label === "bot") &&
      value.maliciousRiskExpectation !== "present"
    ) {
      context.addIssue({
        code: "custom",
        message: "Sybil and bot labels must expect malicious risk to be present",
        path: ["maliciousRiskExpectation"],
      })
    }

    if (
      value.label === "non_user_entity" &&
      value.maliciousRiskExpectation !== "absent"
    ) {
      context.addIssue({
        code: "custom",
        message: "Non-user entities must not be labeled as malicious by default",
        path: ["maliciousRiskExpectation"],
      })
    }
  })

export const benchmarkCaseSchema = z
  .object({
    id: z.string().min(1),
    input: benchmarkWalletInputSchema,
    groundTruth: benchmarkGroundTruthSchema,
    tags: z.array(z.string().min(1)).default([]),
  })
  .strict()

export const benchmarkProvenanceSchema = z
  .object({
    kind: benchmarkProvenanceKindSchema,
    sourceRef: z.string().min(1),
    reviewers: z.array(z.string().min(1)).default([]),
    reviewedAt: z.string().datetime().nullable().default(null),
    notes: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "verified_human") {
      if (value.reviewers.length === 0) {
        context.addIssue({
          code: "custom",
          message: "verified_human provenance requires at least one reviewer",
          path: ["reviewers"],
        })
      }
      if (!value.reviewedAt) {
        context.addIssue({
          code: "custom",
          message: "verified_human provenance requires reviewedAt",
          path: ["reviewedAt"],
        })
      }
    }
  })

export const benchmarkScenarioSchema = z
  .object({
    schemaVersion: z.literal(BENCHMARK_SCENARIO_SCHEMA_VERSION),
    id: z.string().min(1),
    title: z.string().min(1),
    chain: z.string().min(1),
    riskPolicy: riskPolicySchema,
    split: benchmarkSplitSchema,
    provenance: benchmarkProvenanceSchema,
    /**
     * Unlabeled wallets from the same real campaign. They are supplied to the
     * engine so funding/timing/referral/graph relationships are reconstructed,
     * but they never contribute to benchmark metrics.
     */
    contextInputs: z.array(benchmarkWalletInputSchema).default([]),
    cases: z.array(benchmarkCaseSchema).min(1),
    expectations: z
      .object({
        minClusters: z.number().int().nonnegative().optional(),
        maxClusters: z.number().int().nonnegative().optional(),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine((scenario, context) => {
    const ids = new Set<string>()
    const addresses = new Set<string>()

    const comparable = (address: string) =>
      address.startsWith("0x") ? address.toLowerCase() : address

    scenario.contextInputs.forEach((input, index) => {
      const address = comparable(input.walletAddress)
      if (addresses.has(address)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate wallet address in scenario context: ${input.walletAddress}`,
          path: ["contextInputs", index, "walletAddress"],
        })
      }
      addresses.add(address)

      if (
        input.chain.trim().toLowerCase() !==
        scenario.chain.trim().toLowerCase()
      ) {
        context.addIssue({
          code: "custom",
          message: "Context wallet chain must match scenario chain",
          path: ["contextInputs", index, "chain"],
        })
      }
    })

    scenario.cases.forEach((benchmarkCase, index) => {
      if (ids.has(benchmarkCase.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate case id: ${benchmarkCase.id}`,
          path: ["cases", index, "id"],
        })
      }
      ids.add(benchmarkCase.id)

      const address = comparable(benchmarkCase.input.walletAddress)
      if (addresses.has(address)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate wallet address across context/cases: ${benchmarkCase.input.walletAddress}`,
          path: ["cases", index, "input", "walletAddress"],
        })
      }
      addresses.add(address)

      if (
        benchmarkCase.input.chain.trim().toLowerCase() !==
        scenario.chain.trim().toLowerCase()
      ) {
        context.addIssue({
          code: "custom",
          message: "Case chain must match scenario chain",
          path: ["cases", index, "input", "chain"],
        })
      }
    })

    if (
      scenario.expectations.minClusters !== undefined &&
      scenario.expectations.maxClusters !== undefined &&
      scenario.expectations.minClusters > scenario.expectations.maxClusters
    ) {
      context.addIssue({
        code: "custom",
        message: "minClusters cannot exceed maxClusters",
        path: ["expectations"]
      })
    }
  })

export const labeledBenchmarkDatasetSchema = z
  .object({
    schemaVersion: z.literal(BENCHMARK_DATASET_SCHEMA_VERSION),
    datasetVersion: z.string().min(1),
    createdAt: z.string().datetime(),
    description: z.string().min(1),
    scenarios: z.array(benchmarkScenarioSchema).min(1),
  })
  .strict()
  .superRefine((dataset, context) => {
    const scenarioIds = new Set<string>()
    dataset.scenarios.forEach((scenario, index) => {
      if (scenarioIds.has(scenario.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate scenario id: ${scenario.id}`,
          path: ["scenarios", index, "id"]
        })
      }
      scenarioIds.add(scenario.id)
    })
  })

export type BenchmarkLabel = z.infer<typeof benchmarkLabelSchema>
export type BenchmarkProvenanceKind = z.infer<
  typeof benchmarkProvenanceKindSchema
>
export type BenchmarkSplit = z.infer<typeof benchmarkSplitSchema>
export type BenchmarkMaliciousExpectation = z.infer<
  typeof benchmarkMaliciousExpectationSchema
>
export type BenchmarkWalletInput = z.infer<typeof benchmarkWalletInputSchema>
export type BenchmarkGroundTruth = z.infer<typeof benchmarkGroundTruthSchema>
export type BenchmarkCase = z.infer<typeof benchmarkCaseSchema>
export type BenchmarkScenario = z.infer<typeof benchmarkScenarioSchema>
export type LabeledBenchmarkDataset = z.infer<
  typeof labeledBenchmarkDatasetSchema
>

export function parseLabeledBenchmarkDataset(
  value: unknown
): LabeledBenchmarkDataset {
  return labeledBenchmarkDatasetSchema.parse(value)
}

export function isRealWorldProvenance(kind: BenchmarkProvenanceKind) {
  return kind === "verified_human" || kind === "public_reference"
}

export function asParsedWallet(input: BenchmarkWalletInput): ParsedWallet {
  return input as ParsedWallet
}

export function asRiskPolicy(policy: z.infer<typeof riskPolicySchema>): RiskPolicy {
  return policy as RiskPolicy
}

export function asWalletStatus(
  status: z.infer<typeof walletStatusSchema>
): WalletStatus {
  return status as WalletStatus
}
