import type { FeedbackLabel, WalletStatus } from "@/types"

type FeedbackEventLike = {
  label: FeedbackLabel | string
  originalStatus: WalletStatus | string
  finalStatus: WalletStatus | string | null
  riskScore: number
  riskLevel: string
}

type TeamReviewLike = {
  previousStatus: WalletStatus | string
  finalStatus: WalletStatus | string
  feedbackLabel: FeedbackLabel | string | null
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return 0
  return Number(((numerator / denominator) * 100).toFixed(1))
}

function count<T>(items: T[], predicate: (item: T) => boolean) {
  return items.filter(predicate).length
}

function changedDecision(review: TeamReviewLike) {
  return review.previousStatus !== review.finalStatus
}

function originalRejected(event: FeedbackEventLike) {
  return event.originalStatus === "rejected"
}

function originalApproved(event: FeedbackEventLike) {
  return event.originalStatus === "approved"
}

export function buildAccuracyMetrics({
  totalWallets,
  feedbackEvents,
  teamReviews,
}: {
  totalWallets: number
  feedbackEvents: FeedbackEventLike[]
  teamReviews: TeamReviewLike[]
}) {
  const totalFeedback = feedbackEvents.length
  const reviewedWallets = teamReviews.length
  const correctDecision = count(feedbackEvents, (event) => event.label === "correct_decision")
  const falsePositive = count(feedbackEvents, (event) => event.label === "false_positive")
  const falseNegative = count(feedbackEvents, (event) => event.label === "false_negative")
  const confirmedRisk = count(feedbackEvents, (event) => event.label === "confirmed_risk")
  const trustedUser = count(feedbackEvents, (event) => event.label === "trusted_user")
  const needsMoreData = count(feedbackEvents, (event) => event.label === "needs_more_data")
  const changedDecisions = count(teamReviews, changedDecision)

  const rejectedFeedback = feedbackEvents.filter(originalRejected)
  const approvedFeedback = feedbackEvents.filter(originalApproved)
  const rejectedConfirmed = count(rejectedFeedback, (event) =>
    event.label === "confirmed_risk" || event.label === "correct_decision"
  )
  const approvedConfirmed = count(approvedFeedback, (event) =>
    event.label === "trusted_user" || event.label === "correct_decision"
  )

  const reviewedAccuracy = totalFeedback
    ? percent(correctDecision + confirmedRisk + trustedUser, totalFeedback)
    : null

  const rejectionPrecision = rejectedFeedback.length
    ? percent(rejectedConfirmed, rejectedFeedback.length)
    : null

  const approvalPrecision = approvedFeedback.length
    ? percent(approvedConfirmed, approvedFeedback.length)
    : null

  const falsePositiveRate = totalFeedback ? percent(falsePositive, totalFeedback) : null
  const falseNegativeRate = totalFeedback ? percent(falseNegative, totalFeedback) : null
  const coverageRate = totalWallets ? percent(reviewedWallets, totalWallets) : 0
  const decisionChangeRate = reviewedWallets ? percent(changedDecisions, reviewedWallets) : 0

  const calibrationAdvice: string[] = []
  if (falsePositiveRate !== null && falsePositiveRate >= 20) {
    calibrationAdvice.push("High false-positive feedback: consider Conservative policy or higher reject thresholds.")
  }
  if (falseNegativeRate !== null && falseNegativeRate >= 15) {
    calibrationAdvice.push("High false-negative feedback: consider Strict policy or stronger cluster/bot-script thresholds.")
  }
  if (needsMoreData >= Math.max(3, totalFeedback * 0.25)) {
    calibrationAdvice.push("Many wallets need more data: improve provider coverage, campaign contract inputs, or review workflow.")
  }
  if (!totalFeedback) {
    calibrationAdvice.push("No feedback yet: run team review first to build benchmark data.")
  }
  if (!calibrationAdvice.length) {
    calibrationAdvice.push("Feedback distribution looks stable for the current policy. Keep collecting review labels.")
  }

  const scoreBuckets = [
    { label: "0-30", min: 0, max: 30 },
    { label: "31-60", min: 31, max: 60 },
    { label: "61-85", min: 61, max: 85 },
    { label: "86-100", min: 86, max: 100 },
  ].map((bucket) => {
    const events = feedbackEvents.filter(
      (event) => event.riskScore >= bucket.min && event.riskScore <= bucket.max
    )
    return {
      label: bucket.label,
      total: events.length,
      falsePositive: count(events, (event) => event.label === "false_positive"),
      falseNegative: count(events, (event) => event.label === "false_negative"),
      confirmedRisk: count(events, (event) => event.label === "confirmed_risk"),
      trustedUser: count(events, (event) => event.label === "trusted_user"),
    }
  })

  return {
    sampleSize: {
      totalWallets,
      reviewedWallets,
      feedbackEvents: totalFeedback,
      coverageRate,
    },
    feedbackCounts: {
      correctDecision,
      falsePositive,
      falseNegative,
      confirmedRisk,
      trustedUser,
      needsMoreData,
    },
    qualityMetrics: {
      reviewedAccuracy,
      rejectionPrecision,
      approvalPrecision,
      falsePositiveRate,
      falseNegativeRate,
      decisionChangeRate,
    },
    reviewOutcomes: {
      changedDecisions,
      unchangedDecisions: Math.max(reviewedWallets - changedDecisions, 0),
      finalApproved: count(teamReviews, (review) => review.finalStatus === "approved"),
      finalGrayZone: count(teamReviews, (review) => review.finalStatus === "manual_review"),
      finalRejected: count(teamReviews, (review) => review.finalStatus === "rejected"),
    },
    scoreBuckets,
    calibrationAdvice,
  }
}
