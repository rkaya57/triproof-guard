import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const extensionDir = join(process.cwd(), "chrome-extension")
const manifest = JSON.parse(readFileSync(join(extensionDir, "manifest.json"), "utf8"))
const pageUxSource = readFileSync(join(extensionDir, "src", "page-ux-v2.js"), "utf8")
const popupHardeningSource = readFileSync(join(extensionDir, "src", "popup-hardening.js"), "utf8")
const popupUxCss = readFileSync(join(extensionDir, "src", "popup-ux-v2.css"), "utf8")
const backgroundHardeningSource = readFileSync(join(extensionDir, "src", "background-hardening.js"), "utf8")

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

test("UX v2 ships after the primary isolated content UI and preserves the private MAIN entry", () => {
  const main = manifest.content_scripts.find((entry) => entry.world === "MAIN")
  const isolated = manifest.content_scripts.find((entry) => entry.world === "ISOLATED")

  assert.deepEqual(main?.js, ["src/injected.js"])
  assert.ok(isolated?.js?.includes("src/page-ux-v2.js"))
  assert.ok(isolated?.js?.indexOf("src/page-ux-v2.js") > isolated?.js?.indexOf("src/content.js"))
  assert.equal(versionAtLeast(manifest.version, "0.7.3"), true)
})

test("safe pages hide both page surfaces while caution and higher states can restore the prior UI mode", () => {
  assert.match(pageUxSource, /if \(risk === "safe"\)/)
  assert.match(pageUxSource, /banner\.hidden = true/)
  assert.match(pageUxSource, /if \(launcher\) launcher\.hidden = true/)
  assert.match(pageUxSource, /\["caution", "high", "critical"\]\.includes\(risk\)/)
  assert.match(pageUxSource, /sgxAutoHidden/)
  assert.match(pageUxSource, /restore === "minimized"/)
  assert.match(pageUxSource, /data-sgx-ui-closed/)
})

test("page state publishes a privacy-bounded origin plus pathname toolbar status", () => {
  assert.match(pageUxSource, /scamguardPageBadgeStateV2/)
  assert.match(pageUxSource, /window\.location\.origin/)
  assert.match(pageUxSource, /window\.location\.pathname/)
  assert.doesNotMatch(pageUxSource, /window\.location\.search/)
  assert.doesNotMatch(pageUxSource, /window\.location\.hash/)
})

test("toolbar badge state is scoped to an exact sanitized page path", () => {
  assert.match(backgroundHardeningSource, /chrome\.action\.setBadgeText/)
  assert.match(backgroundHardeningSource, /chrome\.action\.setBadgeBackgroundColor/)
  assert.match(backgroundHardeningSource, /chrome\.action\.setTitle/)
  assert.match(backgroundHardeningSource, /pageUrl = `\$\{url\.origin\}\$\{url\.pathname\}`/)
  assert.match(backgroundHardeningSource, /if \(pageUrl !== state\.pageUrl\) continue/)
  assert.match(backgroundHardeningSource, /riskLevel === "CRITICAL"/)
  assert.match(backgroundHardeningSource, /riskLevel === "HIGH_RISK"/)
  assert.match(backgroundHardeningSource, /riskLevel === "CAUTION"/)
})

test("popup keeps primary decision surfaces visible and moves secondary controls into reversible drawers", () => {
  assert.match(popupHardeningSource, /installDecisionFirstLayout/)
  assert.match(popupHardeningSource, /Account & protection/)
  assert.match(popupHardeningSource, /Decision path & evidence/)
  assert.match(popupHardeningSource, /History & Security Center/)
  assert.match(popupHardeningSource, /body\.appendChild\(node\)/)
  assert.match(popupHardeningSource, /popup-ux-v2\.css/)

  // Existing nodes are moved rather than cloned/recreated, preserving popup.js
  // references and event listeners bound before popup-hardening.js executes.
  assert.doesNotMatch(popupHardeningSource, /cloneNode/)
  assert.doesNotMatch(popupHardeningSource, /remove\(\)/)
})

test("compact popup CSS provides accessible native details drawers without hiding advanced settings", () => {
  assert.match(popupUxCss, /\.sgx-popup-drawer > summary/)
  assert.match(popupUxCss, /\.sgx-popup-drawer\[open\]/)
  assert.match(popupUxCss, /\.settings/)
  assert.match(popupUxCss, /\.sgx-quick-status/)
})