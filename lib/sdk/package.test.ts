import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import ts from "typescript"

test("publish-ready SDK package metadata points only at generated dist artifacts", () => {
  const packagePath = path.join(process.cwd(), "packages/triproof-sdk/package.json")
  const manifest = JSON.parse(fs.readFileSync(packagePath, "utf8")) as Record<string, unknown>

  assert.equal(manifest.name, "@triproof/sdk")
  assert.equal(manifest.type, "module")
  assert.equal(manifest.main, "./dist/index.js")
  assert.equal(manifest.types, "./dist/index.d.ts")
  assert.equal(manifest.sideEffects, false)
})

test("standalone SDK tsconfig compiles the package source without diagnostics", () => {
  const configPath = path.join(process.cwd(), "packages/triproof-sdk/tsconfig.json")
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  assert.equal(configFile.error, undefined)

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
    { noEmit: true },
    configPath,
  )
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options })
  const diagnostics = ts.getPreEmitDiagnostics(program)

  assert.deepEqual(
    diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
    [],
  )
})
