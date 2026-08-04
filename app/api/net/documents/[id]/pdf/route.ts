import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { db } from "@/lib/db/prisma"
import { canAccessFormalDocument } from "@/lib/tri-proof-net/documents"

export const runtime = "nodejs"

const pageWidth = 595.28
const pageHeight = 841.89
const margin = 54
const maxWidth = pageWidth - margin * 2

function wrap(text: string, font: { widthOfTextAtSize: (value: string, size: number) => number }, size: number) {
  const lines: string[] = []
  for (const paragraph of text.replaceAll("\r", "").split("\n")) {
    if (!paragraph.trim()) { lines.push(""); continue }
    let line = ""
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate
      else { if (line) lines.push(line); line = word }
    }
    if (line) lines.push(line)
  }
  return lines
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await context.params
  const document = await db.formalDocument.findUnique({
    where: { id },
    include: { author: { select: { name: true, email: true } }, approvals: { orderBy: { sequence: "asc" } }, recipients: { orderBy: { createdAt: "asc" } }, audits: { orderBy: { createdAt: "asc" } } },
  })
  if (!document || !canAccessFormalDocument(document, user)) return NextResponse.json({ error: "Document not found" }, { status: 404 })

  const pdf = await PDFDocument.create()
  const serif = await pdf.embedFont(StandardFonts.TimesRoman)
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const sans = await pdf.embedFont(StandardFonts.Helvetica)
  let page = pdf.addPage([pageWidth, pageHeight])
  let y = pageHeight - margin

  const newPage = () => { page = pdf.addPage([pageWidth, pageHeight]); y = pageHeight - margin }
  const line = (text: string, size = 10, font = serif, gap = 15, color = rgb(0.08, 0.12, 0.18)) => {
    if (y < margin + gap) newPage()
    page.drawText(text, { x: margin, y, size, font, color })
    y -= gap
  }
  const paragraph = (text: string, size = 11, font = serif, gap = 15) => {
    for (const item of wrap(text, font, size)) { if (!item) { y -= gap / 2; continue }; line(item, size, font, gap) }
  }

  line(document.unit.toLocaleUpperCase("tr-TR"), 12, bold, 18)
  line("TRI PROOF NET | INTERNAL DOCUMENT", 8, sans, 16, rgb(0.18, 0.38, 0.52))
  page.drawLine({ start: { x: margin, y: y + 5 }, end: { x: pageWidth - margin, y: y + 5 }, thickness: 0.7, color: rgb(0.35, 0.4, 0.45) })
  y -= 12
  line(`Number: ${document.documentNumber ?? "Draft / number assigned after final approval"}`, 10, serif)
  line(`Date: ${new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(document.approvedAt ?? document.submittedAt ?? document.createdAt)}`, 10, serif)
  line(`Subject: ${document.subject}`, 10, bold, 18)
  line(`To: ${document.recipient}`, 10, serif)
  if (document.reference) line(`Reference: ${document.reference}`, 10, serif)
  y -= 16
  paragraph(document.body, 11, serif, 16)
  y -= 10

  const attachments = Array.isArray(document.attachments) ? document.attachments.map(String).filter(Boolean) : []
  if (attachments.length) { line("Attachments", 10, bold); attachments.forEach((item, index) => line(`${index + 1}. ${item}`, 10, serif)) }
  if (document.recipients.length) {
    y -= 6
    line("Distribution", 10, bold)
    for (const kind of ["ACTION", "INFO"] as const) {
      const recipients = document.recipients.filter((item) => item.kind === kind)
      if (recipients.length) line(`${kind === "ACTION" ? "For action" : "For information"}: ${recipients.map((item) => item.recipientName).join(", ")}`, 10, serif)
    }
  }
  y -= 14
  line(`Prepared by: ${document.author.name}`, 10, bold)
  line(`Internal workflow status: ${document.status.replaceAll("_", " ")}`, 9, sans, 15, rgb(0.18, 0.38, 0.52))
  for (const step of document.approvals) line(`${step.sequence}. ${step.role}: ${step.approverName || step.approverEmail} - ${step.status}${step.actedAt ? ` (${new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(step.actedAt)})` : ""}`, 9, sans, 14)
  y -= 6
  line("This PDF records Tri Proof Net's internal workflow. It is not a qualified electronic signature, e-Yazisma package, or official public-institution dispatch record.", 8, sans, 12, rgb(0.42, 0.16, 0.12))

  const pages = pdf.getPages()
  pages.forEach((item, index) => {
    item.drawText(`Tri Proof Net | ${document.documentNumber ?? "Draft"} | Page ${index + 1} of ${pages.length}`, { x: margin, y: 26, size: 8, font: sans, color: rgb(0.38, 0.42, 0.48) })
  })
  const bytes = await pdf.save()
  const filename = `${document.documentNumber ?? "tri-proof-net-draft"}.pdf`.replaceAll(/[^a-zA-Z0-9._-]/g, "-")
  return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "private, no-store" } })
}
