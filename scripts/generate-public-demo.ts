import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { buildPublicDemoSnapshot } from "@/lib/demo/build-public-snapshot"

async function main() {
const target = path.join(process.cwd(), "public/demo/tri-proof-sample-report.json")
const expected = JSON.stringify(buildPublicDemoSnapshot(), null, 2) + "\n"
if (process.argv.includes("--check")) {
  if ((await readFile(target, "utf8")) !== expected) {
    throw new Error("Public demo snapshot is stale. Review the engine change, then run npm run demo:generate.")
  }
  console.log("Public demo snapshot matches the versioned fixture and current engine.")
} else {
  await writeFile(target, expected)
  console.log(`Updated ${target}`)
}
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
