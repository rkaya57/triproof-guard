import { randomInt } from "node:crypto"

export const SIGNAL_RUN_CARD_COUNT = 8
export const SIGNAL_RUN_DURATION_MS = 45_000
export const SIGNAL_RUN_MAX_ATTEMPTS = 3
export const SIGNAL_RUN_MIN_CORRECT = 6
export const SIGNAL_RUN_BASE_POINTS = 50
export const SIGNAL_RUN_PERFECT_BONUS = 25
export const SIGNAL_RUN_STREAK_STEP_POINTS = 5
export const SIGNAL_RUN_MAX_STREAK_BONUS = 30

export type SignalDecision = "SAFE" | "BLOCK"

export type SignalRunChallenge = {
  id: string
  decision: SignalDecision
  category: string
  title: string
  description: string
  signals: string[]
}

export type SignalRunPublicChallenge = Omit<SignalRunChallenge, "decision">

export const SIGNAL_RUN_CHALLENGES: SignalRunChallenge[] = [
  {
    id: "fake-airdrop-seed",
    decision: "BLOCK",
    category: "Claim site",
    title: "5,000 TRI airdrop unlocked",
    description: "A claim page asks you to paste your recovery phrase before it releases the reward.",
    signals: ["Recovery phrase requested", "Unverified claim domain", "Urgent reward timer"],
  },
  {
    id: "unlimited-approval",
    decision: "BLOCK",
    category: "Wallet approval",
    title: "Unlimited TRI spending approval",
    description: "A newly shared dApp requests unlimited access to your TRI token balance.",
    signals: ["Unlimited allowance", "Unknown spender", "No clear product context"],
  },
  {
    id: "lookalike-mint",
    decision: "BLOCK",
    category: "Token mint",
    title: "TRI bonus token detected",
    description: "The symbol is TRI, but the mint address is different from the official Devnet mint.",
    signals: ["Symbol impersonation", "Mint mismatch", "Unverified sender"],
  },
  {
    id: "support-dm",
    decision: "BLOCK",
    category: "Direct message",
    title: "Support asks to verify your wallet",
    description: "A private account offers faster support if you connect through a shortened external link.",
    signals: ["Unsolicited DM", "Shortened link", "Off-platform wallet prompt"],
  },
  {
    id: "malicious-extension",
    decision: "BLOCK",
    category: "Browser extension",
    title: "Security extension update",
    description: "An extension download page requests broad access to every site you visit.",
    signals: ["Broad permissions", "Unofficial download", "No publisher history"],
  },
  {
    id: "fake-verify-transaction",
    decision: "BLOCK",
    category: "Transaction request",
    title: "Verify ownership to continue",
    description: "The wallet popup contains a token transfer even though the page promised a free verification.",
    signals: ["Unexpected transfer", "Mismatch with page copy", "Value leaves wallet"],
  },
  {
    id: "official-docs",
    decision: "SAFE",
    category: "Documentation",
    title: "Read the official Devnet guide",
    description: "The page links to TriproofProtocol.com documentation and never requests a wallet connection.",
    signals: ["Official domain", "Read-only page", "No signing request"],
  },
  {
    id: "wallet-disconnect",
    decision: "SAFE",
    category: "Account security",
    title: "Disconnect unused dApps",
    description: "Your wallet settings show a known dApp connection that you no longer use.",
    signals: ["Wallet settings", "No transaction", "Reversible action"],
  },
  {
    id: "mint-verify",
    decision: "SAFE",
    category: "Token verification",
    title: "Verify before adding a token",
    description: "A guide asks you to compare a token mint with the official mint published in the protocol docs.",
    signals: ["Official reference", "No approval request", "Address comparison"],
  },
  {
    id: "hardware-wallet-check",
    decision: "SAFE",
    category: "Wallet hygiene",
    title: "Review a hardware wallet screen",
    description: "Your hardware wallet displays the recipient and amount before you approve a transaction you initiated.",
    signals: ["User-initiated action", "Hardware confirmation", "Recipient visible"],
  },
  {
    id: "suspicious-link-scan",
    decision: "SAFE",
    category: "Link safety",
    title: "Scan a suspicious link first",
    description: "You paste a link into a security scanner before opening it and no wallet action is requested.",
    signals: ["Read-only scan", "No connection", "Pre-sign safety check"],
  },
  {
    id: "network-check",
    decision: "SAFE",
    category: "Network check",
    title: "Confirm Devnet before testing",
    description: "You switch your wallet to Solana Devnet before using test tokens and review the network label.",
    signals: ["Correct test network", "No transfer", "Visible cluster label"],
  },
]

export function publicChallenge(challenge: SignalRunChallenge): SignalRunPublicChallenge {
  const { decision: _decision, ...visible } = challenge
  return visible
}

export function createSignalRunSet() {
  const pool = [...SIGNAL_RUN_CHALLENGES]
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const selected = randomInt(index + 1)
    ;[pool[index], pool[selected]] = [pool[selected], pool[index]]
  }
  return pool.slice(0, SIGNAL_RUN_CARD_COUNT)
}

export function parseSignalRunSet(value: unknown): SignalRunChallenge[] {
  if (!Array.isArray(value)) throw new Error("Signal Run session is invalid.")
  const byId = new Map(SIGNAL_RUN_CHALLENGES.map((challenge) => [challenge.id, challenge]))
  const parsed = value.map((item) => {
    const id = typeof item === "object" && item && "id" in item ? String(item.id) : ""
    const challenge = byId.get(id)
    if (!challenge) throw new Error("Signal Run session contains an invalid card.")
    return challenge
  })
  if (parsed.length !== SIGNAL_RUN_CARD_COUNT || new Set(parsed.map((challenge) => challenge.id)).size !== parsed.length) {
    throw new Error("Signal Run session card set is invalid.")
  }
  return parsed
}

export function utcSignalRunDate(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

export function nextUtcSignalRunReset(now = new Date()) {
  const reset = new Date(now)
  reset.setUTCDate(reset.getUTCDate() + 1)
  reset.setUTCHours(0, 0, 0, 0)
  return reset
}

export function signalRunReward(correctAnswers: number, streak: number) {
  if (correctAnswers < SIGNAL_RUN_MIN_CORRECT) return 0
  const perfectBonus = correctAnswers === SIGNAL_RUN_CARD_COUNT ? SIGNAL_RUN_PERFECT_BONUS : 0
  const streakBonus = Math.min(Math.max(0, streak - 1) * SIGNAL_RUN_STREAK_STEP_POINTS, SIGNAL_RUN_MAX_STREAK_BONUS)
  return SIGNAL_RUN_BASE_POINTS + perfectBonus + streakBonus
}

export function previousUtcDates(currentDate: string, count: number) {
  const cursor = new Date(`${currentDate}T00:00:00.000Z`)
  return Array.from({ length: count }, () => {
    cursor.setUTCDate(cursor.getUTCDate() - 1)
    return utcSignalRunDate(cursor)
  })
}
