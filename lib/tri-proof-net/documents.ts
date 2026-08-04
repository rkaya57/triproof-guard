import { FormalApprovalRole, FormalDocumentType, FormalRecipientKind } from "@prisma/client"
import { z } from "zod"

const email = z.string().trim().toLowerCase().email().max(180)

export const documentTypes = [
  { value: FormalDocumentType.OFFICIAL_LETTER, label: "Official letter" },
  { value: FormalDocumentType.DECISION, label: "Decision / approval" },
  { value: FormalDocumentType.MEMO, label: "Internal memo" },
  { value: FormalDocumentType.MINUTES, label: "Meeting minutes" },
  { value: FormalDocumentType.REPORT, label: "Report" },
] as const

export const createFormalDocumentSchema = z.object({
  type: z.nativeEnum(FormalDocumentType).default(FormalDocumentType.OFFICIAL_LETTER),
  unit: z.string().trim().min(2).max(140).default("Tri-Proof Protocol"),
  subject: z.string().trim().min(4).max(240),
  recipient: z.string().trim().min(2).max(240),
  reference: z.string().trim().max(500).optional().nullable(),
  body: z.string().trim().min(20).max(30_000),
  deadlineAt: z.string().datetime().optional().nullable(),
  attachments: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  approvals: z.array(z.object({
    role: z.nativeEnum(FormalApprovalRole),
    email,
    name: z.string().trim().max(120).optional().nullable(),
  })).min(1).max(12),
  recipients: z.array(z.object({
    kind: z.nativeEnum(FormalRecipientKind),
    name: z.string().trim().min(2).max(160),
    email: email.optional().nullable(),
  })).max(60).default([]),
})

export type FormalDocumentInput = z.infer<typeof createFormalDocumentSchema>

export function formatDocumentNumber(sequence: number, date = new Date()) {
  return `TPN-${date.getUTCFullYear()}-${String(sequence).padStart(5, "0")}`
}

export function canAccessFormalDocument(
  document: { authorId: string; approvals: { approverEmail: string }[]; recipients: { recipientEmail: string | null }[] },
  user: { id: string; email: string },
) {
  const email = user.email.toLowerCase()
  return document.authorId === user.id || document.approvals.some((step) => step.approverEmail.toLowerCase() === email) || document.recipients.some((recipient) => recipient.recipientEmail?.toLowerCase() === email)
}

export function actionLabel(event: string) {
  return ({
    CREATED: "Draft created",
    SUBMITTED: "Sent to approval flow",
    APPROVED: "Approval step completed",
    REJECTED: "Returned for revision",
    SENT: "Distributed to recipients",
    ARCHIVED: "Archived",
  } as Record<string, string>)[event] ?? event
}
