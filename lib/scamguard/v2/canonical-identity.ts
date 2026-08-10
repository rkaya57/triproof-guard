import type { ScamGuardSignal } from "@/lib/scamguard/engine"
import type { TokensXyzEvidence, TokensXyzReferenceEvidence } from "@/lib/scamguard/providers/tokens-xyz"

export type CanonicalIdentityComparison = {
  status: "match" | "mismatch" | "insufficient_data"
  claimedAssetId?: string
  mintAssetId?: string
  signal?: ScamGuardSignal
  note: string
}

function normalized(value: string | null | undefined) {
  return value?.trim().toLowerCase() || undefined
}

export function compareCanonicalIdentity(
  mintEvidence: TokensXyzEvidence | undefined,
  claimedEvidence: TokensXyzReferenceEvidence | undefined
): CanonicalIdentityComparison {
  if (mintEvidence?.status !== "available" || claimedEvidence?.status !== "available") {
    return {
      status: "insufficient_data",
      note: "Canonical identity comparison was skipped because one or more Tokens.xyz lookups were unavailable.",
    }
  }

  const mintAssetId = normalized(mintEvidence.canonical?.assetId)
  const claimedAssetId = normalized(claimedEvidence.assetId)
  if (!mintAssetId || !claimedAssetId) {
    return {
      status: "insufficient_data",
      mintAssetId,
      claimedAssetId,
      note: "Canonical identity comparison needs both a mint assetId and a claimed assetId.",
    }
  }

  if (mintAssetId === claimedAssetId) {
    return {
      status: "match",
      mintAssetId,
      claimedAssetId,
      signal: {
        code: "V2_CANONICAL_IDENTITY_MATCH",
        severity: "info",
        title: "Canonical token identity matches",
        detail: `The scanned mint and the claimed asset both resolve to canonical asset ${claimedEvidence.assetId}. This reduces impersonation uncertainty but does not guarantee safety.`,
      },
      note: "Canonical asset grouping matches.",
    }
  }

  return {
    status: "mismatch",
    mintAssetId,
    claimedAssetId,
    signal: {
      code: "V2_CANONICAL_IDENTITY_MISMATCH",
      severity: "critical",
      title: "Claimed token identity does not match mint",
      detail: `The scanned mint resolves to ${mintEvidence.canonical?.assetId}, while the claimed token identity resolves to ${claimedEvidence.assetId}. This is strong impersonation evidence; verify the mint from an official source before interacting.`,
    },
    note: "Canonical asset grouping mismatch can indicate a fake branded token or incorrect mint reference.",
  }
}
