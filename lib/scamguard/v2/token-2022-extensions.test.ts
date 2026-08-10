import assert from "node:assert/strict"
import test from "node:test"

import { inspectToken2022Extensions } from "./token-2022-extensions"

test("classifies Token-2022 authority and transfer control surfaces", () => {
  const inspection = inspectToken2022Extensions({
    data: {
      parsed: {
        info: {
          extensions: [
            { extension: "PermanentDelegate" },
            { extension: "TransferHook" },
            { extension: "TransferFeeConfig" },
            { extension: "TokenMetadata" },
          ],
        },
      },
    },
  })

  assert.deepEqual(inspection.extensions, ["PermanentDelegate", "TransferHook", "TransferFeeConfig", "TokenMetadata"])
  assert.equal(inspection.highestSeverity, "high")
  assert.equal(inspection.controlSurfaceCount, 3)
  assert.ok(inspection.findings.some((finding) => finding.extension === "PermanentDelegate" && finding.category === "authority"))
  assert.ok(inspection.findings.some((finding) => finding.extension === "TransferHook" && finding.category === "transfer"))
})

test("does not label benign or unknown extensions malicious", () => {
  const inspection = inspectToken2022Extensions({
    extensions: ["MetadataPointer", "TokenMetadata", "FutureExtension"],
  })

  assert.equal(inspection.highestSeverity, "info")
  assert.equal(inspection.controlSurfaceCount, 0)
  assert.ok(inspection.note.includes("No extension is treated as proof of maliciousness"))
  assert.ok(inspection.findings.every((finding) => finding.severity === "info"))
})

test("deduplicates extension names and handles missing parsed extensions safely", () => {
  const withDuplicates = inspectToken2022Extensions({
    extensions: ["PausableConfig", "PausableConfig", { type: "NonTransferable" }],
  })
  const missing = inspectToken2022Extensions({ data: { parsed: { info: {} } } })

  assert.deepEqual(withDuplicates.extensions, ["PausableConfig", "NonTransferable"])
  assert.equal(withDuplicates.highestSeverity, "high")
  assert.deepEqual(missing.extensions, [])
  assert.equal(missing.controlSurfaceCount, 0)
})
