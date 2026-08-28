import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const root = process.cwd()
const extensionDir = join(root, "chrome-extension")
const manifestPath = join(extensionDir, "manifest.json")
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))

const requiredFiles = [
  "manifest.json",
  "src/background-entry.js",
  "src/background-hardening.js",
  "src/background.js",
  "src/bridge-isolated.js",
  "src/privacy-transport.js",
  "src/guard-utils.js",
  "src/content.js",
  "src/content.css",
  "src/ui-fix.js",
  "src/ui-fix.css",
  "src/security-hardening.js",
  "src/navigation-performance.js",
  "src/injected.js",
  "src/navigation-main.js",
  "src/popup.html",
  "src/popup.css",
  "src/popup.js",
  "src/popup-hardening.js",
  "src/sidepanel.html",
  "src/sidepanel.css",
  "src/sidepanel.js",
  "assets/icon16.png",
  "assets/icon48.png",
  "assets/icon128.png",
]

const problems = []

if (manifest.manifest_version !== 3) problems.push("manifest_version must be 3")
if (manifest.background?.service_worker !== "src/background-entry.js") problems.push("background must start through src/background-entry.js")
if (!manifest.action?.default_popup) problems.push("action.default_popup is required")
if (!manifest.side_panel?.default_path) problems.push("side_panel.default_path is required")
if (!manifest.permissions?.includes("sidePanel")) problems.push("sidePanel permission is required")
if (manifest.permissions?.includes("scripting")) problems.push("scripting permission is not allowed unless a feature uses chrome.scripting")
if (manifest.minimum_chrome_version !== "114") problems.push("minimum_chrome_version must reflect the side panel requirement")
if (JSON.stringify(manifest).includes("â")) problems.push("manifest contains mojibake characters")

const mainWorld = manifest.content_scripts?.find((entry) => entry?.world === "MAIN")
const isolatedWorld = manifest.content_scripts?.find((entry) => entry?.world === "ISOLATED")
if (!mainWorld || !Array.isArray(mainWorld.js) || mainWorld.js[0] !== "src/injected.js" || mainWorld.run_at !== "document_start") {
  problems.push("MAIN-world wallet hook must load src/injected.js at document_start")
}
if (!(mainWorld?.js ?? []).includes("src/navigation-main.js")) {
  problems.push("MAIN-world SPA navigation monitor is missing")
}
if (!isolatedWorld || !Array.isArray(isolatedWorld.js) || isolatedWorld.js[0] !== "src/bridge-isolated.js" || isolatedWorld.run_at !== "document_start") {
  problems.push("isolated-world private bridge must load before content.js at document_start")
}
if ((isolatedWorld?.js ?? []).indexOf("src/bridge-isolated.js") > (isolatedWorld?.js ?? []).indexOf("src/content.js")) {
  problems.push("src/bridge-isolated.js must execute before src/content.js")
}
if ((isolatedWorld?.js ?? []).indexOf("src/privacy-transport.js") > (isolatedWorld?.js ?? []).indexOf("src/content.js")) {
  problems.push("src/privacy-transport.js must execute before src/content.js")
}
if (!(isolatedWorld?.js ?? []).includes("src/navigation-performance.js")) {
  problems.push("isolated-world SPA rescan handler is missing")
}
if (!(manifest.web_accessible_resources ?? []).some((entry) => (entry.resources ?? []).includes("assets/icon48.png"))) {
  problems.push("assets/icon48.png must remain web-accessible for the page launcher")
}

for (const file of requiredFiles) {
  try {
    const stats = statSync(join(extensionDir, file))
    if (!stats.isFile()) problems.push(`${file} is not a file`)
  } catch {
    problems.push(`${file} is missing`)
  }
}

const textFiles = requiredFiles.filter((file) => /\.(js|css|html|json)$/.test(file))
for (const file of textFiles) {
  const content = readFileSync(join(extensionDir, file), "utf8")
  if (/https:\/\/cdn\.|http:\/\/cdn\.|<script[^>]+src=["']https?:/i.test(content)) {
    problems.push(`${file} appears to load remote executable code`)
  }
  if (/â€|â€”|â€¢/.test(content)) problems.push(`${file} contains mojibake characters`)
}

const classicScripts = [
  "src/background.js",
  "src/bridge-isolated.js",
  "src/privacy-transport.js",
  "src/guard-utils.js",
  "src/content.js",
  "src/ui-fix.js",
  "src/security-hardening.js",
  "src/navigation-performance.js",
  "src/injected.js",
  "src/navigation-main.js",
  "src/popup.js",
  "src/popup-hardening.js",
  "src/sidepanel.js",
]
for (const file of classicScripts) {
  const result = spawnSync(process.execPath, ["--check", join(extensionDir, file)], {
    encoding: "utf8",
  })
  if (result.status !== 0) {
    problems.push(`${file} failed syntax check:\n${result.stderr || result.stdout}`)
  }
}

for (const file of ["src/background-entry.js", "src/background-hardening.js"]) {
  const source = readFileSync(join(extensionDir, file), "utf8")
  const result = spawnSync(process.execPath, ["--input-type=module", "--check"], {
    input: source,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    problems.push(`${file} failed module syntax check:\n${result.stderr || result.stdout}`)
  }
}

const backgroundSource = readFileSync(join(extensionDir, "src/background.js"), "utf8")
if (!backgroundSource.includes("TEAM_POLICY_KEY") || !backgroundSource.includes("/api/v1/team-policies")) {
  problems.push("Team Policy Sync wiring is incomplete")
}
if (!backgroundSource.includes("chrome.storage.local.set({ [TEAM_POLICY_KEY]: teamPolicyApiKey })")) {
  problems.push("Team Policy API keys must be stored in local extension storage")
}
if (!backgroundSource.includes("SECURITY_CENTER_TARGET_KEY") || !backgroundSource.includes("chrome.runtime.getURL(\"src/sidepanel.html\")")) {
  problems.push("Security Center fallback tab wiring is incomplete")
}

const injectedSource = readFileSync(join(extensionDir, "src/injected.js"), "utf8")
if (!injectedSource.includes("SCAMGUARD_BRIDGE_INIT_V1") || !injectedSource.includes("bridgePort")) {
  problems.push("private MAIN-world wallet bridge wiring is incomplete")
}
if (injectedSource.includes("TokenzQdBNbLqP5VEhdkAS6EPF1SMH1dbKqKp6Xk6mN")) {
  problems.push("non-canonical Token-2022 program id is present")
}

const hardeningSource = readFileSync(join(extensionDir, "src/background-hardening.js"), "utf8")
if (!hardeningSource.includes("scamguardTrustedDomainHints") || !hardeningSource.includes("trustedDomains")) {
  problems.push("trusted-domain bypass migration is incomplete")
}
if (!hardeningSource.includes("AbortController") || !hardeningSource.includes("DEFAULT_FETCH_TIMEOUT_MS")) {
  problems.push("bounded extension network timeout is incomplete")
}

const privacySource = readFileSync(join(extensionDir, "src/privacy-transport.js"), "utf8")
if (!privacySource.includes("url.search = \"\"") || !privacySource.includes("url.hash = \"\"")) {
  problems.push("URL query/hash sanitization is incomplete")
}
if (!privacySource.includes("SCAN_TRANSACTION") || !privacySource.includes("SCAN_LINKS")) {
  problems.push("privacy transport must cover transaction source URLs and link batches")
}

if (problems.length) {
  console.error(`Chrome extension validation failed:\n- ${problems.join("\n- ")}`)
  process.exit(1)
}

console.log("Chrome extension validation passed.")
