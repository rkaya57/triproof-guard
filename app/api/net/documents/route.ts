import { NextResponse } from "next/server"
import { FormalDocumentStatus } from "@prisma/client"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import { createFormalDocumentSchema } from "@/lib/tri-proof-net/documents"

export const runtime = "nodejs"

function unauthorized() {
  return NextResponse.json({ error: "Sign in to access Tri Proof Net." }, { status: 401 })
}

export async function GET() {
  const user = await getAdminUser()
  if (!user) return unauthorized()

  const documents = await db.formalDocument.findMany({
    where: {
      OR: [
        { authorId: user.id },
        { approvals: { some: { approverEmail: { equals: user.email, mode: "insensitive" } } } },
        { recipients: { some: { recipientEmail: { equals: user.email, mode: "insensitive" } } } },
      ],
    },
    include: {
      author: { select: { name: true, email: true } },
      approvals: { orderBy: { sequence: "asc" } },
      recipients: { orderBy: { createdAt: "asc" } },
      audits: { orderBy: { createdAt: "desc" }, take: 12 },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  })

  return NextResponse.json({ documents, now: new Date().toISOString() })
}

export async function POST(request: Request) {
  const user = await getAdminUser()
  if (!user) return unauthorized()
  const parsed = createFormalDocumentSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Complete the document subject, recipient, body, and at least one approval step." }, { status: 400 })
  const data = parsed.data

  const document = await db.formalDocument.create({
    data: {
      authorId: user.id,
      type: data.type,
      unit: data.unit,
      subject: data.subject,
      recipient: data.recipient,
      reference: data.reference || null,
      body: data.body,
      attachments: data.attachments,
      deadlineAt: data.deadlineAt ? new Date(data.deadlineAt) : null,
      approvals: { create: data.approvals.map((step, index) => ({ sequence: index + 1, role: step.role, approverEmail: step.email, approverName: step.name || null })) },
      recipients: { create: data.recipients.map((recipient) => ({ kind: recipient.kind, recipientName: recipient.name, recipientEmail: recipient.email || null })) },
      audits: { create: { actorId: user.id, actorName: user.name, event: "CREATED", detail: "Formal document draft created." } },
    },
    include: { approvals: { orderBy: { sequence: "asc" } }, recipients: true, audits: true },
  })

  return NextResponse.json({ document }, { status: 201 })
}

export async function DELETE(request: Request) {
  const user = await getAdminUser()
  if (!user) return unauthorized()
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Document id is required." }, { status: 400 })
  const document = await db.formalDocument.findFirst({ where: { id, authorId: user.id }, select: { status: true } })
  if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 })
  if (document.status !== FormalDocumentStatus.DRAFT && document.status !== FormalDocumentStatus.REJECTED) return NextResponse.json({ error: "Only draft or returned documents can be deleted." }, { status: 409 })
  await db.formalDocument.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
