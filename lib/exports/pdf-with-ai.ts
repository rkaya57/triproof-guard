import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"

import { buildPdfReport } from "@/lib/exports/pdf"
import type { AnalysisDetail, AiAnalysisBrief } from "@/types"

const PAGE = { w: 612, h: 792 }
const MARGIN = 48
const FOOTER_Y = 40
const CONTENT_W = PAGE.w - MARGIN * 2

const C = {
  bg: rgb(8 / 255, 12 / 255, 24 / 255),
  panel: rgb(17 / 255, 26 / 255, 44 / 255),
  border: rgb(34 / 255, 52 / 255, 82 / 255),
  cyan: rgb(56 / 255, 189 / 255, 248 / 255),
  text: rgb(232 / 255, 238 / 255, 247 / 255),
  muted: rgb(148 / 255, 163 / 255, 184 / 255),
  green: rgb(34 / 255, 197 / 255, 94 / 255),
  yellow: rgb(250 / 255, 204 / 255, 21 / 255),
  red: rgb(239 / 255, 68 / 255, 68 / 255),
}

type Ctx = {
  pdf: PDFDocument
  page: PDFPage
  font: PDFFont
  bold: PDFFont
  y: number
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

function addPage(ctx: Ctx) {
  ctx.page = ctx.pdf.addPage([PAGE.w, PAGE.h])
  ctx.page.drawRectangle({ x: 0, y: 0, width: PAGE.w, height: PAGE.h, color: C.bg })
  ctx.page.drawLine({
    start: { x: MARGIN, y: FOOTER_Y + 14 },
    end: { x: PAGE.w - MARGIN, y: FOOTER_Y + 14 },
    thickness: 0.5,
    color: C.border,
  })
  ctx.page.drawText("Tri-Proof Guard  •  AI Evidence Report Appendix", {
    x: MARGIN,
    y: FOOTER_Y,
    size: 8,
    font: ctx.font,
    color: C.muted,
  })
  ctx.y = PAGE.h - MARGIN
}

function ensure(ctx: Ctx, height: number) {
  if (ctx.y - height < FOOTER_Y + 28) addPage(ctx)
}

function paragraph(
  ctx: Ctx,
  text: string,
  options: { size?: number; bold?: boolean; color?: typeof C.text; indent?: number } = {}
) {
  const size = options.size ?? 10
  const font = options.bold ? ctx.bold : ctx.font
  const color = options.color ?? C.text
  const indent = options.indent ?? 0
  const lineHeight = size + 4
  const lines = wrap(text, font, size, CONTENT_W - indent)
  for (const line of lines) {
    ensure(ctx, lineHeight)
    ctx.page.drawText(line, {
      x: MARGIN + indent,
      y: ctx.y - size,
      size,
      font,
      color,
    })
    ctx.y -= lineHeight
  }
}

function heading(ctx: Ctx, text: string) {
  ensure(ctx, 32)
  ctx.y -= 8
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - 12,
    width: 3,
    height: 14,
    color: C.cyan,
  })
  ctx.page.drawText(text.toUpperCase(), {
    x: MARGIN + 10,
    y: ctx.y - 10,
    size: 11,
    font: ctx.bold,
    color: C.text,
  })
  ctx.y -= 22
}

function bullet(ctx: Ctx, text: string, color = C.cyan) {
  ensure(ctx, 18)
  ctx.page.drawCircle({ x: MARGIN + 4, y: ctx.y - 7, size: 1.6, color })
  paragraph(ctx, text, { size: 9.5, color: C.muted, indent: 14 })
}

function driverColor(severity: "info" | "caution" | "high") {
  if (severity === "high") return C.red
  if (severity === "caution") return C.yellow
  return C.cyan
}

function appendAiBrief(ctx: Ctx, brief: AiAnalysisBrief) {
  addPage(ctx)

  ctx.page.drawRectangle({
    x: 0,
    y: PAGE.h - 92,
    width: PAGE.w,
    height: 92,
    color: C.panel,
  })
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE.h - 92,
    width: PAGE.w,
    height: 2,
    color: C.cyan,
  })
  ctx.page.drawText("AI EVIDENCE REPORT", {
    x: MARGIN,
    y: PAGE.h - 42,
    size: 17,
    font: ctx.bold,
    color: C.text,
  })
  ctx.page.drawText(
    brief.source === "gemini"
      ? `Audited production evidence • ${brief.model ?? "Gemini"}`
      : "Deterministic evidence fallback",
    {
      x: MARGIN,
      y: PAGE.h - 62,
      size: 9,
      font: ctx.font,
      color: C.muted,
    }
  )
  ctx.y = PAGE.h - 116

  heading(ctx, "Executive Summary")
  paragraph(ctx, brief.executiveSummary, { size: 11, bold: true })
  ctx.y -= 6
  paragraph(ctx, brief.decisionRationale, { size: 9.5, color: C.muted })

  if (brief.riskDrivers.length) {
    heading(ctx, "Primary Evidence Drivers")
    brief.riskDrivers.forEach((driver) => {
      bullet(
        ctx,
        `${driver.title}: ${driver.explanation}`,
        driverColor(driver.severity)
      )
    })
  }

  if (brief.recommendedActions.length) {
    heading(ctx, "Recommended Actions")
    brief.recommendedActions.forEach((action) => bullet(ctx, action, C.green))
  }

  if (brief.limitations.length) {
    heading(ctx, "Methodology Limits")
    brief.limitations.forEach((limitation) => bullet(ctx, limitation, C.yellow))
  }

  ctx.y -= 8
  paragraph(
    ctx,
    "AI analysis is decision support only. It does not change the deterministic Tri-Proof risk score and does not prove common ownership, automation, Sybil behavior, or malicious intent.",
    { size: 8.5, color: C.muted }
  )
}

export async function buildPdfReportWithAi(analysis: AnalysisDetail) {
  const base = await buildPdfReport(analysis)
  if (!analysis.aiBrief) return base

  const pdf = await PDFDocument.load(base)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const initial = pdf.getPages()[pdf.getPageCount() - 1] ?? pdf.addPage([PAGE.w, PAGE.h])
  const ctx: Ctx = { pdf, page: initial, font, bold, y: PAGE.h - MARGIN }
  appendAiBrief(ctx, analysis.aiBrief)
  return pdf.save()
}
