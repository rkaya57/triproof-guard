import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const root = process.cwd()
const extensionDir = join(root, "chrome-extension")
const manifestPath = join(extensionDir, "manifest.json")
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))

const requiredFiles = [
  "manifest.json",
  "src/background.js",
  "src/guard-utils.js",
  "src/content.js",
  "src/content.css",
  "src/ui-fix.js",
  "src/ui-fix.css",
  "src/injected.js",
  "src/popup.html",
  "src/popup.css",
  "src/popup.js",
  "src/sidepanel.html",
  "src/sidepanel.css",
  "src/sidepanel.js",
  "assets/icon16.png",
  "assets/icon48.png",
  "assets/icon128.png",
]

const problems = []

if (manifest.manifest_version !== 3) problems.push("manifest_version must be 3")
if (!manifest.background?.service_worker) problems.push("background.service_worker is required")
if (!manifest.action?.default_popup) problems.push("action.default_popup is required")
if (!manifest.side_panel?.default_path) problems.push("side_panel.default_path is required")
if (!manifest.permissions?.includes("sidePanel")) problems.push("sidePanel permission is required")
if (manifest.permissions?.includes("scripting")) problems.push("scripting permission is not allowed unless a feature uses chrome.scripting")
if (manifest.minimum_chrome_version !== "114") problems.push("minimum_chrome_version must reflect the side panel requirement")
if (JSON.stringify(manifest).includes("â")) problems.push("manifest contains mojibake characters")

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

for (const file of ["src/background.js", "src/guard-utils.js", "src/content.js", "src/ui-fix.js", "src/injected.js", "src/popup.js", "src/sidepanel.js"]) {
  const result = spawnSync(process.execPath, ["--check", join(extensionDir, file)], {
    encoding: "utf8",
  })
  if (result.status !== 0) {
    problems.push(`${file} failed syntax check:\n${result.stderr || result.stdout}`)
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

const contentScript = manifest.content_scripts?.[0]
if (!contentScript?.js?.includes("src/ui-fix.js")) problems.push("ScamGuard UI fix content script is not registered")
if (!contentScript?.css?.includes("src/ui-fix.css")) problems.push("ScamGuard UI fix stylesheet is not registered")

const accessibleResources = (manifest.web_accessible_resources ?? []).flatMap((entry) => entry.resources ?? [])
if (!accessibleResources.includes("assets/icon48.png")) {
  problems.push("Launcher icon must be web-accessible when rendered inside the page DOM")
}

if (problems.length) {
  console.error(`Chrome extension validation failed:\n- ${problems.join("\n- ")}`)
  process.exit(1)
}

console.log("Chrome extension validation passed.")
