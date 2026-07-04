import { readFile } from "node:fs/promises"
import path from "node:path"

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib"

import { actionLabel, decisionExplanation, decisionLabel } from "@/lib/decision-labels"
import type { AnalysisDetail } from "@/types"

// ---------------------------------------------------------------------------
// Layout + palette
// ---------------------------------------------------------------------------

const PAGE = { w: 612, h: 792 }
const MARGIN = 48
const CONTENT_W = PAGE.w - MARGIN * 2
const FOOTER_Y = 40

function hex(r: number, g: number, b: number) {
  return rgb(r / 255, g / 255, b / 255)
}

const C = {
  bg: hex(8, 12, 24),
  panel: hex(17, 26, 44),
  panelBorder: hex(34, 52, 82),
  cyan: hex(56, 189, 248),
  text: hex(232, 238, 247),
  muted: hex(148, 163, 184),
  green: hex(34, 197, 94),
  yellow: hex(250, 204, 21),
  orange: hex(251, 146, 60),
  red: hex(239, 68, 68),
  purple: hex(139, 92, 246),
  white: hex(255, 255, 255),
}

const disclaimer =
  "Tri-Proof Guard provides probabilistic risk analysis and decision support. A wallet being flagged does not prove malicious intent. Known exchange or service wallets are flagged for review because they may not represent individual reward participants. Final reward decisions should be made by the project team."

// ---------------------------------------------------------------------------
// Drawing context
// ---------------------------------------------------------------------------

type Ctx = {
  pdf: PDFDocument
  page: PDFPage
  font: PDFFont
  bold: PDFFont
  y: number
  pageNo: number
}

function paintBackground(page: PDFPage) {
  page.drawRectangle({ x: 0, y: 0, width: PAGE.w, height: PAGE.h, color: C.bg })
}

function drawFooter(ctx: Ctx) {
  ctx.page.drawLine({
    start: { x: MARGIN, y: FOOTER_Y + 14 },
    end: { x: PAGE.w - MARGIN, y: FOOTER_Y + 14 },
    thickness: 0.5,
    color: C.panelBorder,
  })
  ctx.page.drawText("Tri-Proof Guard  •  Confidential risk report", {
    x: MARGIN,
    y: FOOTER_Y,
    size: 8,
    font: ctx.font,
    color: C.muted,
  })
  const label = `Page ${ctx.pageNo}`
  const width = ctx.font.widthOfTextAtSize(label, 8)
  ctx.page.drawText(label, {
    x: PAGE.w - MARGIN - width,
    y: FOOTER_Y,
    size: 8,
    font: ctx.font,
    color: C.muted,
  })
}

function addPage(ctx: Ctx, withRunningHeader: boolean) {
  ctx.page = ctx.pdf.addPage([PAGE.w, PAGE.h])
  ctx.pageNo += 1
  paintBackground(ctx.page)
  drawFooter(ctx)

  if (withRunningHeader) {
    ctx.page.drawText("Tri-Proof Guard — Wallet Risk Analysis Report", {
      x: MARGIN,
      y: PAGE.h - MARGIN,
      size: 9,
      font: ctx.bold,
      color: C.muted,
    })
    ctx.page.drawLine({
      start: { x: MARGIN, y: PAGE.h - MARGIN - 8 },
      end: { x: PAGE.w - MARGIN, y: PAGE.h - MARGIN - 8 },
      thickness: 0.5,
      color: C.panelBorder,
    })
    ctx.y = PAGE.h - MARGIN - 26
  } else {
    ctx.y = PAGE.h - MARGIN
  }
}

function ensure(ctx: Ctx, needed: number) {
  if (ctx.y - needed < FOOTER_Y + 26) {
    addPage(ctx, true)
  }
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

function paragraph(
  ctx: Ctx,
  text: string,
  options: { size?: number; color?: ReturnType<typeof rgb>; bold?: boolean; indent?: number } = {}
) {
  const size = options.size ?? 10
  const color = options.color ?? C.text
  const font = options.bold ? ctx.bold : ctx.font
  const indent = options.indent ?? 0
  const lineHeight = size + 4
  const lines = wrapText(text, font, size, CONTENT_W - indent)
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

function sectionHeading(ctx: Ctx, title: string) {
  ensure(ctx, 30)
  ctx.y -= 12
  // accent tab
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - 11,
    width: 3,
    height: 13,
    color: C.cyan,
  })
  ctx.page.drawText(title.toUpperCase(), {
    x: MARGIN + 10,
    y: ctx.y - 10,
    size: 11,
    font: ctx.bold,
    color: C.text,
  })
  ctx.y -= 18
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE.w - MARGIN, y: ctx.y },
    thickness: 0.5,
    color: C.panelBorder,
  })
  ctx.y -= 10
}

function gap(ctx: Ctx, amount = 6) {
  ctx.y -= amount
}

// ---------------------------------------------------------------------------
// Composite blocks
// ---------------------------------------------------------------------------

/** Vector brand emblem (shield + check) drawn directly into the PDF. */
function drawLogoMark(ctx: Ctx, x: number, yTop: number, scale: number) {
  const shield = "M13 1 L24 6 V16 C24 23 19.5 28 13 31 C6.5 28 2 23 2 16 V6 Z"
  const check = "M8 15 l4 4 l7 -9"
  ctx.page.drawSvgPath(shield, {
    x,
    y: yTop,
    scale,
    color: C.panel,
    borderColor: C.cyan,
    borderWidth: 1.6,
  })
  ctx.page.drawSvgPath(check, {
    x,
    y: yTop,
    scale,
    borderColor: C.cyan,
    borderWidth: 2.4,
  })
}

function drawHeader(ctx: Ctx, analysis: AnalysisDetail, logo: PDFImage | null) {
  const bandH = 92
  const top = PAGE.h
  ctx.page.drawRectangle({
    x: 0,
    y: top - bandH,
    width: PAGE.w,
    height: bandH,
    color: C.panel,
  })
  ctx.page.drawRectangle({
    x: 0,
    y: top - bandH,
    width: PAGE.w,
    height: 2,
    color: C.cyan,
  })
  // logo mark — embed a real raster logo if one was provided, otherwise draw
  // the vector brand emblem (never the transparent placeholder).
  const markSize = 40
  const hasRaster = Boolean(logo && logo.width > 4)
  if (hasRaster && logo) {
    ctx.page.drawImage(logo, {
      x: MARGIN,
      y: top - 16 - markSize,
      width: markSize,
      height: markSize,
    })
  } else {
    drawLogoMark(ctx, MARGIN, top - 14, 1.3)
  }
  const textX = MARGIN + markSize + 14
  ctx.page.drawText("TRI-PROOF GUARD", {
    x: textX,
    y: top - 44,
    size: 16,
    font: ctx.bold,
    color: C.text,
  })
  ctx.page.drawText("Wallet Risk Analysis Report", {
    x: textX,
    y: top - 62,
    size: 10,
    font: ctx.font,
    color: C.muted,
  })

  const dateLabel = new Date(analysis.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
  const dateWidth = ctx.font.widthOfTextAtSize(dateLabel, 10)
  ctx.page.drawText(dateLabel, {
    x: PAGE.w - MARGIN - dateWidth,
    y: top - 44,
    size: 10,
    font: ctx.bold,
    color: C.text,
  })
  const chainLabel = `${analysis.project.chain} • ${analysis.project.campaignType}`
  const chainWidth = ctx.font.widthOfTextAtSize(chainLabel, 9)
  ctx.page.drawText(chainLabel, {
    x: PAGE.w - MARGIN - chainWidth,
    y: top - 62,
    size: 9,
    font: ctx.font,
    color: C.muted,
  })

  ctx.y = top - bandH - 18

  // project name
  paragraph(ctx, analysis.project.name, { size: 14, bold: true })
  paragraph(
    ctx,
    `Source: ${analysis.csvFileName ?? "uploaded CSV"}  •  Generated ${new Date(
      analysis.createdAt
    ).toLocaleString("en-US")}`,
    { size: 9, color: C.muted }
  )
}

function statCards(
  ctx: Ctx,
  cards: Array<{ label: string; value: string; accent: ReturnType<typeof rgb> }>
) {
  const gapX = 10
  const cardW = (CONTENT_W - gapX * (cards.length - 1)) / cards.length
  const cardH = 58
  ensure(ctx, cardH + 6)
  const top = ctx.y
  cards.forEach((card, index) => {
    const x = MARGIN + index * (cardW + gapX)
    ctx.page.drawRectangle({
      x,
      y: top - cardH,
      width: cardW,
      height: cardH,
      color: C.panel,
      borderColor: C.panelBorder,
      borderWidth: 1,
    })
    ctx.page.drawRectangle({
      x,
      y: top - 3,
      width: cardW,
      height: 3,
      color: card.accent,
    })
    ctx.page.drawText(card.label.toUpperCase(), {
      x: x + 10,
      y: top - 20,
      size: 7.5,
      font: ctx.bold,
      color: C.muted,
    })
    ctx.page.drawText(card.value, {
      x: x + 10,
      y: top - 44,
      size: 19,
      font: ctx.bold,
      color: C.text,
    })
  })
  ctx.y = top - cardH - 4
}

function riskBars(
  ctx: Ctx,
  rows: Array<{ label: string; value: number; color: ReturnType<typeof rgb> }>
) {
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1
  const max = Math.max(...rows.map((row) => row.value), 1)
  const labelW = 64
  const valueW = 70
  const trackW = CONTENT_W - labelW - valueW
  const rowH = 20
  rows.forEach((row) => {
    ensure(ctx, rowH)
    const baseY = ctx.y - 12
    ctx.page.drawText(row.label, {
      x: MARGIN,
      y: baseY,
      size: 9,
      font: ctx.font,
      color: C.muted,
    })
    ctx.page.drawRectangle({
      x: MARGIN + labelW,
      y: baseY - 2,
      width: trackW,
      height: 9,
      color: C.panel,
    })
    const fillW = Math.max(2, (row.value / max) * trackW)
    ctx.page.drawRectangle({
      x: MARGIN + labelW,
      y: baseY - 2,
      width: fillW,
      height: 9,
      color: row.color,
    })
    const pct = Math.round((row.value / total) * 100)
    ctx.page.drawText(`${row.value.toLocaleString()} (${pct}%)`, {
      x: MARGIN + labelW + trackW + 8,
      y: baseY,
      size: 9,
      font: ctx.font,
      color: C.text,
    })
    ctx.y -= rowH
  })
}

function table(
  ctx: Ctx,
  columns: Array<{ header: string; width: number; align?: "left" | "right" }>,
  rows: string[][]
) {
  const rowH = 18
  ensure(ctx, rowH)
  // header
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - rowH + 4,
    width: CONTENT_W,
    height: rowH,
    color: C.panel,
  })
  let x = MARGIN + 8
  columns.forEach((col) => {
    const label = col.header.toUpperCase()
    const tx =
      col.align === "right"
        ? x + col.width - 16 - ctx.bold.widthOfTextAtSize(label, 7.5)
        : x
    ctx.page.drawText(label, {
      x: tx,
      y: ctx.y - rowH + 10,
      size: 7.5,
      font: ctx.bold,
      color: C.muted,
    })
    x += col.width
  })
  ctx.y -= rowH

  rows.forEach((row, rowIndex) => {
    ensure(ctx, rowH)
    if (rowIndex % 2 === 1) {
      ctx.page.drawRectangle({
        x: MARGIN,
        y: ctx.y - rowH + 4,
        width: CONTENT_W,
        height: rowH,
        color: C.panel,
        opacity: 0.5,
      })
    }
    let cx = MARGIN + 8
    row.forEach((cell, cellIndex) => {
      const col = columns[cellIndex]
      const size = 9
      const value =
        col.align === "right"
          ? cx + col.width - 16 - ctx.font.widthOfTextAtSize(cell, size)
          : cx
      ctx.page.drawText(cell, {
        x: value,
        y: ctx.y - rowH + 9,
        size,
        font: ctx.font,
        color: C.text,
      })
      cx += col.width
    })
    ctx.y -= rowH
  })
}

function bullet(ctx: Ctx, text: string, color = C.cyan) {
  ensure(ctx, 16)
  ctx.page.drawCircle({ x: MARGIN + 3, y: ctx.y - 6, size: 1.6, color })
  paragraph(ctx, text, { size: 9.5, indent: 14 })
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export async function buildPdfReport(analysis: AnalysisDetail) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const ctx: Ctx = {
    pdf,
    page: pdf.addPage([PAGE.w, PAGE.h]),
    font,
    bold,
    y: PAGE.h - MARGIN,
    pageNo: 1,
  }
  paintBackground(ctx.page)
  drawFooter(ctx)

  // Brand logo (optional). Missing/invalid file never breaks the report.
  let logo: PDFImage | null = null
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "logo.png"))
    logo = await pdf.embedPng(bytes)
  } catch {
    logo = null
  }

  const dist = {
    low: analysis.wallets.filter((wallet) => wallet.riskLevel === "low").length,
    medium: analysis.wallets.filter((wallet) => wallet.riskLevel === "medium").length,
    high: analysis.wallets.filter((wallet) => wallet.riskLevel === "high").length,
    critical: analysis.wallets.filter((wallet) => wallet.riskLevel === "critical").length,
  }
  const knownWallets = analysis.wallets.filter((wallet) => wallet.entityLabel)
  const entities = {
    total: knownWallets.length,
    exchange: knownWallets.filter((wallet) => wallet.entityType === "exchange").length,
    service: knownWallets.filter((wallet) => wallet.entityType === "service").length,
  }

  drawHeader(ctx, analysis, logo)

  // KPI cards
  gap(ctx, 10)
  statCards(ctx, [
    { label: "Total wallets", value: analysis.totalWallets.toLocaleString(), accent: C.cyan },
    { label: decisionLabel("approved"), value: analysis.approvedCount.toLocaleString(), accent: C.green },
    { label: decisionLabel("manual_review"), value: analysis.manualReviewCount.toLocaleString(), accent: C.yellow },
    { label: decisionLabel("rejected"), value: analysis.rejectedCount.toLocaleString(), accent: C.red },
    { label: "Avg risk", value: String(analysis.averageRiskScore), accent: C.purple },
  ])

  // Decision summary
  sectionHeading(ctx, "Decision Summary")
  bullet(
    ctx,
    `${analysis.approvedCount.toLocaleString()} ${decisionLabel("approved")} wallets - ${decisionExplanation("approved")}`,
    C.green
  )
  bullet(
    ctx,
    `${analysis.manualReviewCount.toLocaleString()} ${decisionLabel("manual_review")} wallets - ${decisionExplanation("manual_review")}`,
    C.yellow
  )
  bullet(
    ctx,
    `${analysis.rejectedCount.toLocaleString()} ${decisionLabel("rejected")} wallets - ${decisionExplanation("rejected")}`,
    C.red
  )
  bullet(
    ctx,
    `${analysis.suspiciousClustersCount.toLocaleString()} suspicious clusters detected - coordinated wallet groups requiring review.`,
    C.purple
  )

  // Risk distribution
  sectionHeading(ctx, "Risk Distribution")
  riskBars(ctx, [
    { label: "Low", value: dist.low, color: C.green },
    { label: "Medium", value: dist.medium, color: C.yellow },
    { label: "High", value: dist.high, color: C.orange },
    { label: "Critical", value: dist.critical, color: C.red },
  ])

  // Known entities
  sectionHeading(ctx, "Known Entity Findings")
  table(
    ctx,
    [
      { header: "Category", width: CONTENT_W - 110 },
      { header: "Count", width: 110, align: "right" },
    ],
    [
      ["Exchange wallets", entities.exchange.toLocaleString()],
      ["Service wallets", entities.service.toLocaleString()],
      ["Total known entities", entities.total.toLocaleString()],
    ]
  )
  gap(ctx, 4)
  paragraph(
    ctx,
    "Known entities are not automatically malicious, but they are not typical individual campaign participants and should be placed in the Gray Zone.",
    { size: 8.5, color: C.muted }
  )

  // Clusters
  if (analysis.clusters.length) {
    sectionHeading(ctx, "Top Suspicious Clusters")
    table(
      ctx,
      [
        { header: "Cluster", width: 90 },
        { header: "Wallets", width: 90, align: "right" },
        { header: "Avg risk", width: 110, align: "right" },
        { header: "Suggested action", width: CONTENT_W - 290, align: "right" },
      ],
      analysis.clusters.slice(0, 8).map((cluster) => [
        cluster.clusterLabel,
        cluster.walletCount.toLocaleString(),
        String(cluster.averageRiskScore),
        actionLabel(cluster.suggestedAction),
      ])
    )
  }

  // On-chain enrichment
  if (analysis.enrichment) {
    const enriched = analysis.wallets.filter((wallet) => wallet.walletAgeDays != null)
    const avgAge = enriched.length
      ? Math.round(
          enriched.reduce((sum, wallet) => sum + (wallet.walletAgeDays ?? 0), 0) / enriched.length
        )
      : 0
    const withTx = analysis.wallets.filter((wallet) => wallet.txCount != null)
    const avgTx = withTx.length
      ? Math.round(withTx.reduce((sum, wallet) => sum + (wallet.txCount ?? 0), 0) / withTx.length)
      : 0
    const fundingCounts = new Map<string, number>()
    analysis.wallets.forEach((wallet) => {
      if (wallet.fundingSource) {
        fundingCounts.set(wallet.fundingSource, (fundingCounts.get(wallet.fundingSource) ?? 0) + 1)
      }
    })
    const topFunding = Array.from(fundingCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)

    sectionHeading(ctx, "On-Chain Enrichment Summary")
    table(
      ctx,
      [
        { header: "Metric", width: CONTENT_W - 150 },
        { header: "Value", width: 150, align: "right" },
      ],
      [
        ["Provider used", analysis.enrichment.provider],
        ["Enriched wallets", analysis.enrichment.enrichedCount.toLocaleString()],
        ["Failed enrichments", analysis.enrichment.failedCount.toLocaleString()],
        ["Cache hits", analysis.enrichment.cacheHits.toLocaleString()],
        ["Average wallet age", `${avgAge} days`],
        ["Average tx count", String(avgTx)],
      ]
    )
    if (analysis.enrichment.usedMockFallback) {
      gap(ctx, 4)
      paragraph(ctx, "Note: mock enrichment data was used (no provider API key configured).", {
        size: 8.5,
        color: C.muted,
      })
    }
    if (topFunding.length) {
      gap(ctx, 4)
      paragraph(ctx, "Top shared funding sources:", { size: 9, bold: true })
      topFunding.forEach(([source, count]) =>
        bullet(ctx, `${source} — ${count} wallets`, C.purple)
      )
    }
  }

  // Key risk findings
  const findings = analysis.wallets
    .flatMap((wallet) => wallet.reasons)
    .filter((reason, index, all) => all.indexOf(reason) === index)
    .slice(0, 10)
  if (findings.length) {
    sectionHeading(ctx, "Key Risk Findings")
    findings.forEach((finding) => bullet(ctx, finding))
  }

  // Disclaimer
  sectionHeading(ctx, "Disclaimer")
  paragraph(ctx, disclaimer, { size: 8.5, color: C.muted })

  return pdf.save()
}
