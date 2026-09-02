import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const extensionDir = join(process.cwd(), "chrome-extension")
const manifest = JSON.parse(readFileSync(join(extensionDir, "manifest.json"), "utf8"))
const recorder = readFileSync(join(extensionDir, "src", "outcome-recorder.js"), "utf8")
const outcomeUi = readFileSync(join(extensionDir, "src", "outcome-ui.js"), "utf8")
const popupHardening = readFileSync(join(extensionDir, "src", "popup-hardening.js"), "utf8")
const sidepanel = readFileSync(join(extensionDir, "src", "sidepanel.html"), "utf8")

function versionAtLeast(actual, minimum) {
  const a = String(actual).split(".").map(Number)
  const b = String(minimum).split(".").map(Number)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index] ?? 0
    const right = b[index] ?? 0
    if (left !== right) return left > right
  }
  return true
}

test("outcome recorder loads after the decision overlay and UX layers", () => {
  const isolated = manifest.content_scripts.find((entry) => entry.world === "ISOLATED")
  assert.ok(isolated?.js?.includes("src/outcome-recorder.js"))
  assert.ok(isolated?.js?.indexOf("src/outcome-recorder.js") > isolated?.js?.indexOf("src/content.js"))
  assert.ok(isolated?.js?.indexOf("src/outcome-recorder.js") > isolated?.js?.indexOf("src/page-ux-v2.js"))
  assert.equal(versionAtLeast(manifest.version, "0.7.4"), true)
})

test("actual overlay outcomes distinguish blocked, cancelled, and continued actions", () => {
  assert.match(recorder, /forceBlocked/)
  assert.match(recorder, /decision === "continue"/)
  assert.match(recorder, /\? "continued"/)
  assert.match(recorder, /\? "blocked"/)
  assert.match(recorder, /: "cancelled"/)
  assert.match(recorder, /\.sgx-force-block/)
  assert.match(recorder, /data-decision/)
  assert.match(recorder, /event\.key !== "Escape"/)
})

test("scan outcomes are recorded separately from user decisions and de-duplicated", () => {
  assert.match(recorder, /outcome: "scanned"/)
  assert.match(recorder, /DEDUP(E|E)_WINDOW_MS|DEDUPE_WINDOW_MS/)
  assert.match(recorder, /duplicate && outcome\.outcome === "scanned"/)
})

test("outcome targets never persist query parameters, fragments, or raw transaction payloads", () => {
  assert.match(recorder, /window\.location\.origin/)
  assert.match(recorder, /window\.location\.pathname/)
  assert.doesNotMatch(recorder, /window\.location\.search/)
  assert.doesNotMatch(recorder, /window\.location\.hash/)
  assert.doesNotMatch(recorder, /payload\.value/)
})

test("Security Center blocked count comes from explicit blocked outcomes", () => {
  assert.match(outcomeUi, /const counts = \{ blocked: 0, cancelled: 0, continued: 0, scanned: 0 \}/)
  assert.match(outcomeUi, /setTextWithoutLoop\(popupBlocked, summary\.blocked\)/)
  assert.match(outcomeUi, /setTextWithoutLoop\(panelBlocked, summary\.blocked\)/)
  assert.match(outcomeUi, /blocked actions/)
  assert.doesNotMatch(outcomeUi, /riskLevel === "CRITICAL"/)
})

test("local privacy reset excludes account, plan, settings, and team policy credentials", () => {
  assert.match(outcomeUi, /scamguardScanHistory/)
  assert.match(outcomeUi, /scamguardObservedPermissions/)
  assert.match(outcomeUi, /scamguardProtectionOutcomesV2/)
  assert.match(outcomeUi, /scamguardPageBadgeStateV2/)
  assert.doesNotMatch(outcomeUi, /scamguardExtensionAccessToken/)
  assert.doesNotMatch(outcomeUi, /scamguardExtensionConnection/)
  assert.doesNotMatch(outcomeUi, /scamguardTeamPolicyApiKey/)
  assert.match(outcomeUi, /Click again to confirm/)
})

test("outcome UI is loaded in both popup and full Security Center", () => {
  assert.match(popupHardening, /outcome-ui\.js/)
  assert.match(sidepanel, /src="outcome-ui\.js"/)
  assert.match(sidepanel, /blocked actions/)
})
