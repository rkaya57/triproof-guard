import type { ParsedWallet } from "@/types"
import {
  buildWalletGraphIntelligence as buildStandardWalletGraphIntelligence,
  fundingContextKey,
  graphNodeKindLabel,
  graphSignalForWallet,
  isNeutralServiceAddress,
  normalizeGraphAddress,
  type WalletGraphContext,
  type WalletGraphIntelligence,
  type WalletGraphSignal,
} from "../graph-intelligence"
import { buildScalableWalletGraphIntelligence } from "@/lib/graph-intelligence/scalable"

export {
  fundingContextKey,
  graphNodeKindLabel,
  graphSignalForWallet,
  isNeutralServiceAddress,
  normalizeGraphAddress,
}
export type {
  WalletGraphContext,
  WalletGraphIntelligence,
  WalletGraphSignal,
}

function scalableThreshold() {
  const parsed = Number.parseInt(
    process.env.SYBIL_SCALABLE_ENGINE_THRESHOLD ?? "10000",
    10
  )
  return Number.isFinite(parsed) && parsed >= 1_000 ? parsed : 10_000
}

export function buildWalletGraphIntelligence(
  wallets: ParsedWallet[],
  context: WalletGraphContext | null = null
): WalletGraphIntelligence {
  return wallets.length >= scalableThreshold()
    ? buildScalableWalletGraphIntelligence(wallets, context)
    : buildStandardWalletGraphIntelligence(wallets, context)
}
