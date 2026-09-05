import assert from "node:assert/strict"
import test from "node:test"
import { PDFDocument } from "pdf-lib"
import Papa from "papaparse"
import { buildPublicDemoSnapshot } from "@/lib/demo/build-public-snapshot"
import { publicDemoSnapshot as demo } from "@/lib/demo/public-snapshot"
import { publicDemoCsv, publicDemoPdf } from "@/lib/demo/public-exports"
import { publicDecisionLabels } from "@/lib/demo/public-types"
import { GET } from "@/app/api/demo/report/export/route"

test("public snapshot is reproducible from frozen inputs and current engine", () => {
  assert.deepEqual(buildPublicDemoSnapshot(), demo)
  assert.equal(demo.wallets.length, demo.summary.totalWallets)
  assert.equal(demo.summary.approved + demo.summary.review + demo.summary.insufficient_data + demo.summary.not_eligible, demo.summary.totalWallets)
  for (const kind of Object.keys(publicDecisionLabels)) assert.ok(demo.wallets.some((wallet) => wallet.decision === kind))
})

test("coverage and eligibility do not display a misleading low or high malicious-risk score", () => {
  const unavailable = demo.wallets.find((wallet) => wallet.decision === "insufficient_data")!
  assert.equal(unavailable.storedStatus, "manual_review")
  assert.equal(unavailable.riskScore, null)
  assert.equal(unavailable.riskLabel, "Not assessed")
  const entity = demo.wallets.find((wallet) => wallet.riskLabel === "Not applicable")!
  assert.equal(entity.decision, "not_eligible")
  assert.equal(entity.riskScore, null)
  assert.ok(demo.wallets.some((wallet) => wallet.clusterId && (wallet.riskScore ?? 0) > 0))
})

test("CSV and JSON preserve every displayed decision and assessment", async () => {
  const csv = Papa.parse<Record<string, string>>(publicDemoCsv(demo), { header: true })
  assert.equal(csv.errors.length, 0)
  assert.equal(csv.data.length, demo.wallets.length)
  demo.wallets.forEach((wallet, index) => {
    assert.equal(csv.data[index].decision_label, publicDecisionLabels[wallet.decision])
    assert.equal(csv.data[index].risk_assessment, wallet.riskLabel)
    assert.equal(csv.data[index].risk_score, String(wallet.riskScore ?? ""))
  })
  assert.deepEqual(await (await GET(new Request("http://localhost/api/demo/report/export?format=json"))).json(), demo)
  assert.equal((await GET(new Request("http://localhost/api/demo/report/export?format=invalid"))).status, 400)
})

test("PDF export is a readable document generated without provider access", async () => {
  const pdf = await PDFDocument.load(await publicDemoPdf(demo))
  assert.ok(pdf.getPageCount() >= 2)
  assert.equal(pdf.getTitle(), "Tri-Proof illustrative campaign evidence report")
})
