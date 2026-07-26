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
  "src/content.js",
  "src/content.css",
  "src/injected.js",
  "src/popup.html",
  "src/popup.css",
  "src/popup.js",
  "assets/icon16.png",
  "assets/icon48.png",
  "assets/icon128.png",
]

const problems = []

if (manifest.manifest_version !== 3) problems.push("manifest_version must be 3")
if (!manifest.background?.service_worker) problems.push("background.service_worker is required")
if (!manifest.action?.default_popup) problems.push("action.default_popup is required")

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
}

for (const file of ["src/background.js", "src/content.js", "src/injected.js", "src/popup.js"]) {
  const result = spawnSync(process.execPath, ["--check", join(extensionDir, file)], {
    encoding: "utf8",
  })
  if (result.status !== 0) {
    problems.push(`${file} failed syntax check:\n${result.stderr || result.stdout}`)
  }
}

if (problems.length) {
  console.error(`Chrome extension validation failed:\n- ${problems.join("\n- ")}`)
  process.exit(1)
}

console.log("Chrome extension validation passed.")
