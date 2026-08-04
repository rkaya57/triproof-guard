import { NextResponse } from "next/server"
import { FormalApprovalStatus, FormalDocumentStatus } from "@prisma/client"
import { z } from "zod"

import { getCurrentUser } from "@/lib/auth/session"
import { db } from "@/lib/db/prisma"
import { canAccessFormalDocument, formatDocumentNumber } from "@/lib/tri-proof-net/documents"

export const runtime = "nodejs"

const actionSchema = z.object({
  action: z.enum(["SUBMIT", "APPROVE", "REJECT", "SEND", "ARCHIVE", "MARK_READ"]),
  note: z.string().trim().max(2_000).optional().nullable(),
})

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

async function documentForUser(id: string, user: { id: string; email: string }) {
  const document = await db.formalDocument.findUnique({
    where: { id },
    include: { approvals: { orderBy: { sequence: "asc" } }, recipients: true, audits: { orderBy: { createdAt: "desc" }, take: 30 }, author: { select: { name: true, email: true } } },
  })
  return document && canAccessFormalDocument(document, user) ? document : null
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return error("Unauthorized", 401)
  const { id } = await context.params
  const document = await documentForUser(id, user)
  if (!document) return error("Document not found.", 404)
  return NextResponse.json({ document })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return error("Unauthorized", 401)
  const { id } = await context.params
  const parsed = actionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return error("Invalid document action.", 400)
  const document = await documentForUser(id, user)
  if (!document) return error("Document not found.", 404)
  const { action, note } = parsed.data
  const isAuthor = document.authorId === user.id
  const currentStep = document.approvals.find((step) => step.status === FormalApprovalStatus.PENDING) ?? null

  if (action === "SUBMIT") {
    if (!isAuthor || (document.status !== FormalDocumentStatus.DRAFT && document.status !== FormalDocumentStatus.REJECTED)) return error("Only the author can submit a draft or returned document.", 403)
    const updated = await db.$transaction(async (tx) => {
      await tx.formalDocumentApproval.updateMany({ where: { documentId: id }, data: { status: FormalApprovalStatus.PENDING, note: null, actedAt: null } })
      return tx.formalDocument.update({
        where: { id },
        data: { status: FormalDocumentStatus.IN_REVIEW, submittedAt: new Date(), audits: { create: { actorId: user.id, actorName: user.name, event: "SUBMITTED", detail: note || "Document submitted to the internal approval flow." } } },
        include: { approvals: { orderBy: { sequence: "asc" } }, recipients: true, audits: { orderBy: { createdAt: "desc" }, take: 30 }, author: { select: { name: true, email: true } } },
      })
    })
    return NextResponse.json({ document: updated })
  }

  if (action === "APPROVE" || action === "REJECT") {
    if (document.status !== FormalDocumentStatus.IN_REVIEW || !currentStep || currentStep.approverEmail.toLowerCase() !== user.email.toLowerCase()) return error("This approval step is not assigned to your account.", 403)
    const now = new Date()
    const updated = await db.$transaction(async (tx) => {
      await tx.formalDocumentApproval.update({ where: { id: currentStep.id }, data: { status: action === "APPROVE" ? FormalApprovalStatus.APPROVED : FormalApprovalStatus.REJECTED, note: note || null, actedAt: now } })
      if (action === "REJECT") {
        return tx.formalDocument.update({ where: { id }, data: { status: FormalDocumentStatus.REJECTED, audits: { create: { actorId: user.id, actorName: user.name, event: "REJECTED", detail: note || "Returned for revision." } } }, include: { approvals: { orderBy: { sequence: "asc" } }, recipients: true, audits: { orderBy: { createdAt: "desc" }, take: 30 }, author: { select: { name: true, email: true } } } })
      }
      const remaining = await tx.formalDocumentApproval.count({ where: { documentId: id, status: FormalApprovalStatus.PENDING } })
      const data = remaining === 0
        ? { status: FormalDocumentStatus.APPROVED, approvedAt: now, documentNumber: document.documentNumber ?? formatDocumentNumber((await tx.formalDocument.count({ where: { documentNumber: { startsWith: `TPN-${now.getUTCFullYear()}-` } } })) + 1, now) }
        : {}
      return tx.formalDocument.update({ where: { id }, data: { ...data, audits: { create: { actorId: user.id, actorName: user.name, event: "APPROVED", detail: note || (remaining === 0 ? "Final internal approval completed." : "Approval step completed; forwarded to the next step.") } } }, include: { approvals: { orderBy: { sequence: "asc" } }, recipients: true, audits: { orderBy: { createdAt: "desc" }, take: 30 }, author: { select: { name: true, email: true } } } })
    })
    return NextResponse.json({ document: updated })
  }

  if (action === "SEND") {
    if (!isAuthor || document.status !== FormalDocumentStatus.APPROVED) return error("Only an approved document can be distributed by its author.", 403)
    const now = new Date()
    const updated = await db.formalDocument.update({
      where: { id },
      data: { status: FormalDocumentStatus.SENT, sentAt: now, recipients: { updateMany: { where: { documentId: id }, data: { deliveredAt: now } } }, audits: { create: { actorId: user.id, actorName: user.name, event: "SENT", detail: note || "Document distributed to its internal recipients." } } },
      include: { approvals: { orderBy: { sequence: "asc" } }, recipients: true, audits: { orderBy: { createdAt: "desc" }, take: 30 }, author: { select: { name: true, email: true } } },
    })
    return NextResponse.json({ document: updated })
  }

  if (action === "ARCHIVE") {
    if (!isAuthor || (document.status !== FormalDocumentStatus.APPROVED && document.status !== FormalDocumentStatus.SENT)) return error("Only an approved or sent document can be archived.", 403)
    const updated = await db.formalDocument.update({ where: { id }, data: { status: FormalDocumentStatus.ARCHIVED, archivedAt: new Date(), audits: { create: { actorId: user.id, actorName: user.name, event: "ARCHIVED", detail: note || "Document archived." } } }, include: { approvals: { orderBy: { sequence: "asc" } }, recipients: true, audits: { orderBy: { createdAt: "desc" }, take: 30 }, author: { select: { name: true, email: true } } } })
    return NextResponse.json({ document: updated })
  }

  const recipient = document.recipients.find((item) => item.recipientEmail?.toLowerCase() === user.email.toLowerCase())
  if (!recipient) return error("This document is not addressed to your account.", 403)
  await db.formalDocumentRecipient.update({ where: { id: recipient.id }, data: { readAt: new Date() } })
  return NextResponse.json({ ok: true })
}
