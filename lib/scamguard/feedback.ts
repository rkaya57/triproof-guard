import { mkdir, appendFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import path from "node:path"

const feedbackPath = path.join(process.cwd(), ".data", "scamguard-feedback.jsonl")

export type ScamGuardFeedbackVerdict = "reported_scam" | "reported_safe" | "false_positive" | "false_negative"

export async function saveScamGuardFeedback(input: {
  scanId?: string
  verdict: ScamGuardFeedbackVerdict
  value?: string
  chain?: string
  reason?: string
  source?: string
}) {
  await mkdir(path.dirname(feedbackPath), { recursive: true })
  const record = {
    id: randomUUID(),
    scanId: input.scanId?.trim() || null,
    verdict: input.verdict,
    value: input.value?.trim().slice(0, 500) || null,
    chain: input.chain?.trim().slice(0, 32) || null,
    reason: input.reason?.trim().slice(0, 1000) || null,
    source: input.source?.trim().slice(0, 80) || "public_api",
    createdAt: new Date().toISOString(),
  }
  await appendFile(feedbackPath, `${JSON.stringify(record)}\n`, "utf8")
  return record
}
