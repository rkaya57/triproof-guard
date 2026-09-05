import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { publicDecisionLabels, type PublicDemoSnapshot } from "@/lib/demo/public-types"

function csvCell(value: string | number | null) {
  const text = String(value ?? "")
  return `"${text.replaceAll('"', '""')}"`
}

export function publicDemoCsv(demo: PublicDemoSnapshot) {
  const rows = demo.wallets.map((wallet) => [
    demo.version, demo.provenance.kind, wallet.label, wallet.address,
    wallet.decision, publicDecisionLabels[wallet.decision], wallet.storedStatus,
    wallet.riskScore, wallet.riskLabel, wallet.clusterId, wallet.explanation,
  ].map(csvCell).join(","))
  return ["snapshot,provenance,example,wallet_address,decision,decision_label,stored_status,risk_score,risk_assessment,cluster,explanation", ...rows].join("\n")
}

export async function publicDemoPdf(demo: PublicDemoSnapshot) {
  const pdf = await PDFDocument.create()
  pdf.setTitle("Tri-Proof illustrative campaign evidence report")
  pdf.setSubject(demo.provenance.notice)
  pdf.setCreationDate(new Date(demo.provenance.asOf))
  pdf.setModificationDate(new Date(demo.provenance.asOf))
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page = pdf.addPage([612, 792])
  let y = 732
  const ink = rgb(0.1, 0.16, 0.24)
  const muted = rgb(0.3, 0.36, 0.43)
  function line(text: string, size = 10, strong = false) {
    if (y < 62) { page = pdf.addPage([612, 792]); y = 732 }
    page.drawText(text, { x: 44, y, size, font: strong ? bold : font, color: strong ? ink : muted })
    y -= size + 7
  }
  function paragraph(text: string, size = 10) {
    const words = text.replace(/[^\x20-\x7E]/g, " ").split(/\s+/)
    let current = ""
    for (const word of words) {
      if (font.widthOfTextAtSize(`${current} ${word}`, size) > 518 && current) { line(current, size); current = word }
      else current = current ? `${current} ${word}` : word
    }
    if (current) line(current, size)
  }
  line("TRI-PROOF PROTOCOL", 11, true)
  y -= 10
  line("Campaign evidence demo", 24, true)
  paragraph(demo.provenance.notice)
  y -= 10
  line(`${demo.summary.totalWallets} wallets | ${demo.summary.clusters} linked cohort`, 13, true)
  paragraph(`${demo.summary.approved} approved; ${demo.summary.review} need review; ${demo.summary.insufficient_data} insufficient data; ${demo.summary.not_eligible} not eligible.`)
  y -= 12
  for (const [text, x] of [["EXAMPLE", 44], ["DECISION", 150], ["RISK ASSESSMENT", 340]] as const) {
    page.drawText(text, { x, y, size: 10, font: bold, color: ink })
  }
  y -= 17
  for (const wallet of demo.wallets) {
    page.drawText(wallet.label, { x: 44, y, size: 10, font, color: ink })
    page.drawText(publicDecisionLabels[wallet.decision], { x: 150, y, size: 10, font, color: ink })
    page.drawText(wallet.riskLabel, { x: 340, y, size: 10, font, color: ink })
    y -= 24
  }
  y -= 12
  paragraph("Missing evidence is not a finding of misconduct. Protocol accounts can be ineligible without malicious evidence. A shared funder alone does not prove common control.")
  y -= 8
  paragraph(`Snapshot: ${demo.version}; as of ${demo.provenance.asOf.slice(0, 10)}.`)
  paragraph(`Engine: ${demo.provenance.engineVersion}; ruleset: ${demo.provenance.rulesetVersion}; policy: ${demo.provenance.policy}.`)
  paragraph(`Input SHA-256: ${demo.provenance.inputSha256}`, 8)
  page = pdf.addPage([612, 792]); y = 732
  line("Decision evidence", 22, true)
  paragraph("The explanations below match the interactive report. All observations are illustrative.")
  for (const wallet of demo.wallets) {
    if (y < 160) { page = pdf.addPage([612, 792]); y = 732 }
    y -= 12
    line(`${wallet.label} | ${publicDecisionLabels[wallet.decision]} | ${wallet.riskLabel}`, 11, true)
    paragraph(wallet.address, 8)
    paragraph(wallet.explanation)
  }
  pdf.getPages().forEach((item, index) => item.drawText(`Illustrative demo - not customer results | Page ${index + 1} of ${pdf.getPageCount()}`, { x: 44, y: 30, size: 8, font, color: muted }))
  return pdf.save()
}
