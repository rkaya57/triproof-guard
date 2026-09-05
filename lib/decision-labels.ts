import type { SuggestedAction, WalletStatus } from "@/types"

type DecisionCopy = {
  label: string
  shortLabel: string
  csvLabel: string
  apiDecision: string
  explanation: string
}

export const decisionCopy: Record<WalletStatus, DecisionCopy> = {
  approved: {
    label: "Approved",
    shortLabel: "Approved",
    csvLabel: "Approved",
    apiDecision: "approved",
    explanation: "Eligible for reward distribution based on the available wallet evidence.",
  },
  manual_review: {
    label: "Gray Zone",
    shortLabel: "Gray Zone",
    csvLabel: "Gray Zone",
    apiDecision: "gray_zone",
    explanation: "Ambiguous wallet evidence; the project team should review it before reward inclusion.",
  },
  rejected: {
    label: "Rejected / Not Eligible",
    shortLabel: "Not Eligible",
    csvLabel: "Rejected / Not Eligible",
    apiDecision: "rejected_not_eligible",
    explanation: "Excluded from automatic rewards based on recorded risk evidence or eligibility rules. Ineligibility does not establish malicious intent; insufficient evidence requires review.",
  },
}

export function decisionLabel(status: WalletStatus) {
  return decisionCopy[status].label
}

export function decisionShortLabel(status: WalletStatus) {
  return decisionCopy[status].shortLabel
}

export function decisionCsvLabel(status: WalletStatus) {
  return decisionCopy[status].csvLabel
}

export function decisionExplanation(status: WalletStatus) {
  return decisionCopy[status].explanation
}

export function apiDecisionValue(status: WalletStatus) {
  return decisionCopy[status].apiDecision
}

export function actionLabel(action: SuggestedAction) {
  if (action === "approve") return "Approve"
  if (action === "manual_review") return "Gray Zone"
  return "Reject / Not Eligible"
}

export function decisionLegendForApi() {
  return (Object.keys(decisionCopy) as WalletStatus[]).map((status) => ({
    status,
    decision: apiDecisionValue(status),
    label: decisionLabel(status),
    explanation: decisionExplanation(status),
  }))
}
