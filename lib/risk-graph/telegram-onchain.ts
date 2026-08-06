import {
  normalizeSharedRiskLevel,
  sharedRiskGraphNodeKey,
  SharedRiskGraphBuilder,
} from "@/lib/risk-graph/builder"
import type {
  SharedRiskGraphNodeKind,
  SharedRiskGraphTelegramObservation,
} from "@/lib/risk-graph/types"

function entityLabel(kind: SharedRiskGraphNodeKind, value: string) {
  if (kind === "domain") return value
  if (kind === "url") {
    try {
      return new URL(value).hostname || value
    } catch {
      return value
    }
  }
  return `${kind.replaceAll("_", " ")} ${value.slice(0, 10)}${value.length > 10 ? "…" : ""}`
}

function verdictFromScore(score: number) {
  if (score >= 80) return "known_bad" as const
  if (score >= 50) return "suspicious" as const
  return "unknown" as const
}

export function addTelegramOnchainSource(
  builder: SharedRiskGraphBuilder,
  observations: SharedRiskGraphTelegramObservation[]
) {
  const enriched = observations.filter(
    (observation) => (observation.extractedEntities?.length ?? 0) > 0
  )
  if (enriched.length === 0) return
  builder.markCoverage("telegramOnchain")

  enriched.forEach((scan) => {
    const messageKey = sharedRiskGraphNodeKey("telegram_message", scan.id)
    const riskLevel = normalizeSharedRiskLevel(scan.riskLevel)
    const verdict = verdictFromScore(scan.score)

    builder.addNode({
      key: messageKey,
      kind: "telegram_message",
      label: `Message ${scan.messageId}`,
      value: scan.id,
      chain: scan.chain || null,
      riskLevel,
      riskScore: scan.score,
      verdict,
      sources: ["telegram_guardian"],
      metadata: {
        scanType: scan.scanType,
        confidence: scan.confidence,
        summary: scan.summary,
        onchainEntityCount: scan.extractedEntities?.length ?? 0,
      },
    })

    for (const entity of scan.extractedEntities ?? []) {
      const kind = entity.kind as SharedRiskGraphNodeKind
      const entityKey = sharedRiskGraphNodeKey(kind, entity.value, entity.chain)
      builder.addNode({
        key: entityKey,
        kind,
        label: entityLabel(kind, entity.value),
        value: entity.value,
        chain: entity.chain,
        riskLevel,
        riskScore: scan.score,
        verdict,
        sources: ["telegram_guardian"],
        metadata: {
          extractedFromTelegram: true,
          extractionConfidence: entity.confidence,
          parentUrl: entity.parentUrl,
        },
      })

      builder.addEdge({
        key: `telegram-observed:${entityKey}:${messageKey}`,
        source: entityKey,
        target: messageKey,
        kind: "OBSERVED_IN",
        confidence: entity.confidence,
        riskBearing: scan.score >= 50,
        observedAt: scan.createdAt,
        sources: ["telegram_guardian"],
        evidence: [entity.evidence, scan.summary],
        metadata: { extraction: "deterministic" },
      })

      if (!entity.parentUrl || kind === "url") continue
      const urlKey = sharedRiskGraphNodeKey("url", entity.parentUrl)
      builder.addNode({
        key: urlKey,
        kind: "url",
        label: entityLabel("url", entity.parentUrl),
        value: entity.parentUrl,
        chain: null,
        riskLevel,
        riskScore: scan.score,
        verdict,
        sources: ["telegram_guardian"],
        metadata: { extractedFromTelegram: true },
      })

      builder.addEdge({
        key: `${kind === "domain" ? "hosted" : "targets"}:${urlKey}:${entityKey}`,
        source: urlKey,
        target: entityKey,
        kind: kind === "domain" ? "HOSTED_ON" : "TARGETS",
        confidence: entity.confidence,
        riskBearing: kind !== "domain" && scan.score >= 50,
        observedAt: scan.createdAt,
        sources: ["telegram_guardian"],
        evidence: [entity.evidence],
        metadata: { extraction: "deterministic" },
      })
    }
  })
}
